/**
 * CEVIZ 라이선스 관리 모듈 (Phase 27)
 *
 * 검증 흐름:
 *   온라인 → LemonSqueezy API activate/validate
 *   오프라인 (≤14일) → 캐시된 globalState 사용
 *   오프라인 (>14일) → 온라인 재검증 필수 경고
 *   JWT 폴백 → RSA 공개키로 서명 검증
 */

import * as vscode from "vscode";
import * as crypto from "crypto";
import axios from "axios";

// ── 타입 ──────────────────────────────────────────────────────────────────────

export type LicensePlan = "trial" | "personal" | "pro" | "founder" | "expired";

export interface LicenseState {
    plan: LicensePlan;
    keyMasked: string;
    deviceId: string;
    activatedAt: string;
    lastValidatedAt: string;
    expiresAt: string | null;
    trialStartDate: string | null;
    instanceId: string | null;
    variantId: string | null;
}

export interface LicenseCheckResult {
    allowed: boolean;
    plan: LicensePlan;
    trialDaysLeft: number;
    reason?: string;
}

export interface ActivateResult {
    ok: boolean;
    plan?: LicensePlan;
    error?: string;
}

// ── 플랜별 제한 ───────────────────────────────────────────────────────────────

export const PLAN_LIMITS: Record<LicensePlan, {
    cloudCallsPerDay: number;
    rssFeeds: number;
    evolution: boolean;
    voice: boolean;
    multiWorkspace: boolean;
    devices: number;
    whitepaper: boolean;
}> = {
    trial: {
        cloudCallsPerDay: 50,
        rssFeeds: 3,
        evolution: false,
        voice: false,
        multiWorkspace: false,
        devices: 1,
        whitepaper: false,
    },
    personal: {
        cloudCallsPerDay: Infinity,
        rssFeeds: Infinity,
        evolution: true,
        voice: true,
        multiWorkspace: true,
        devices: 1,
        whitepaper: true,
    },
    pro: {
        cloudCallsPerDay: Infinity,
        rssFeeds: Infinity,
        evolution: true,
        voice: true,
        multiWorkspace: true,
        devices: 3,
        whitepaper: true,
    },
    founder: {
        cloudCallsPerDay: Infinity,
        rssFeeds: Infinity,
        evolution: true,
        voice: true,
        multiWorkspace: true,
        devices: Infinity,
        whitepaper: true,
    },
    expired: {
        cloudCallsPerDay: 0,
        rssFeeds: 3,
        evolution: false,
        voice: false,
        multiWorkspace: false,
        devices: 1,
        whitepaper: false,
    },
};

// ── 상수 ──────────────────────────────────────────────────────────────────────

const LS_API_BASE      = "https://api.lemonsqueezy.com/v1/licenses";
const SECRET_KEY         = "ceviz.licenseKey";
const JWT_SECRET_KEY     = "ceviz.licenseJwt";       // 오프라인 JWT 저장
const STATE_GKEY         = "ceviz.licenseState";
const TRIAL_START_GKEY   = "ceviz.trialStartDate";
const SHOWN_NUDGE_GKEY   = "ceviz.licenseNudgeShown";
const JWT_FETCHED_GKEY   = "ceviz.licenseJwtFetchedAt"; // 마지막 JWT 갱신 시각

const TRIAL_DAYS         = 14;
const REVALIDATE_DAYS    = 7;
const OFFLINE_GRACE_DAYS = 14;
const JWT_REFRESH_DAYS   = 30; // JWT 갱신 주기 (30일)

/**
 * RSA-2048 공개키 (플레이스홀더).
 * LEMONSQUEEZY-SETUP.md 지침에 따라 실제 키로 교체하세요.
 * openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem
 * openssl rsa -in private.pem -pubout -out public.pem
 */
const RSA_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy5FMtA+nCeMlYx6xVIWM
2aIwiAL+PNAZrpgut2eS3ADsr4pDocZBhft0xWztO+o88eiZswcJTOsJTVe9OT6m
Hlao/JU1ljR34sZIOkyYzm055J5Clg/SfDmtx3Ex0XbQH+tRNITv6JIebtIjsntU
UbcRGVnICx9ZvwakWcSiEmt6zQ+kqrYSneyGXs4UcgqlwaIY6wGWrz9lJ1OvlCJF
HwUgELQtUYbpVYVCWkRAK1mIMcoiR3CG+lZO1ciac7MZjUP0ylv1edTsNH8es66q
fALB45IXjsoAwVVuyMLFnC0XQUzKsE/NhbdY+fzxQjxoZpevTXEjnNhGPoChxppW
MwIDAQAB
-----END PUBLIC KEY-----`;

// SHA-256(machineId) — 평문을 소스에 저장하지 않음
const DEV_MACHINE_HASH = "677b77b29fbed1660c7731fe2acc60dda93b0fac3645aed5ddbb4e3a4c5d7bd6";

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

/** XXXX-XXXX-XXXX-XXXX 또는 LemonSqueezy UUID 형식 수용 */
export function isValidKeyFormat(key: string): boolean {
    const trimmed = key.trim().toUpperCase();
    // LemonSqueezy 기본 형식: 8자리 블록 또는 XXXX 블록
    return /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(trimmed) ||
           /^[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{12}$/.test(trimmed);
}

/** 라이선스 키 마스킹: 앞 4자리 + ****-****-XXXX */
export function maskKey(key: string): string {
    const k = key.trim().toUpperCase();
    const parts = k.split("-");
    if (parts.length < 2) { return "****"; }
    return `${parts[0]}-****-****-${parts[parts.length - 1]}`;
}

/** variant_name 문자열로부터 플랜 감지 */
function planFromVariantName(name: string): LicensePlan {
    const n = name.toLowerCase();
    if (n.includes("founder")) { return "founder"; }
    if (n.includes("pro"))     { return "pro"; }
    if (n.includes("personal")) { return "personal"; }
    return "personal";
}

// ── LicenseManager ────────────────────────────────────────────────────────────

export class LicenseManager {

    constructor(
        private readonly secrets: vscode.SecretStorage,
        private readonly globalState: vscode.Memento,
        private readonly machineId: string,
    ) {}

    // ── 개발자 머신 감지 ─────────────────────────────────────────────────────

    private _isDevMachine(): boolean {
        return crypto.createHash("sha256").update(this.machineId).digest("hex") === DEV_MACHINE_HASH;
    }

    private _devFounderState(): LicenseState {
        return {
            plan:            "founder",
            keyMasked:       "DEV-****-****-FREE",
            deviceId:        this.machineId,
            activatedAt:     "2026-01-01T00:00:00.000Z",
            lastValidatedAt: new Date().toISOString(),
            expiresAt:       null,
            trialStartDate:  null,
            instanceId:      "dev",
            variantId:       null,
        };
    }

    // ── 초기화 ───────────────────────────────────────────────────────────────

    /**
     * 확장 시작 시 호출.
     * 트라이얼 시작일을 기록하고 캐시 상태를 반환.
     */
    async initialize(): Promise<LicenseState> {
        if (this._isDevMachine()) { return this._devFounderState(); }
        this._ensureTrialStart();
        const cached = this._getCachedState();
        if (cached) { return cached; }

        // globalState가 초기화된 경우 (재설치 등) → JWT로 상태 복원 시도
        const jwt = await this.secrets.get(JWT_SECRET_KEY);
        if (jwt) {
            const result = await this.verifyOfflineJwt(jwt);
            if (result.ok) {
                return this._getCachedState() ?? this._buildTrialState();
            }
        }
        return this._buildTrialState();
    }

    /** 트라이얼 시작일이 없으면 지금 기록 */
    private _ensureTrialStart(): void {
        if (!this.globalState.get<string>(TRIAL_START_GKEY)) {
            this.globalState.update(TRIAL_START_GKEY, new Date().toISOString());
        }
    }

    private _getCachedState(): LicenseState | undefined {
        return this.globalState.get<LicenseState>(STATE_GKEY);
    }

    private _buildTrialState(): LicenseState {
        const start = this.globalState.get<string>(TRIAL_START_GKEY) ?? new Date().toISOString();
        return {
            plan: "trial",
            keyMasked: "",
            deviceId: this.machineId,
            activatedAt: start,
            lastValidatedAt: start,
            expiresAt: null,
            trialStartDate: start,
            instanceId: null,
            variantId: null,
        };
    }

    // ── 트라이얼 상태 ─────────────────────────────────────────────────────────

    /** 트라이얼 남은 일수 (0 이하 = 만료) */
    trialDaysLeft(): number {
        const start = this.globalState.get<string>(TRIAL_START_GKEY);
        if (!start) { return TRIAL_DAYS; }
        const ms = Date.now() - new Date(start).getTime();
        return Math.max(0, TRIAL_DAYS - Math.floor(ms / 86_400_000));
    }

    isTrialExpired(): boolean {
        if (this._isDevMachine()) { return false; }
        const state = this._getCachedState();
        if (state && state.plan !== "trial") { return false; }
        return this.trialDaysLeft() <= 0;
    }

    // ── 기능 게이트 ───────────────────────────────────────────────────────────

    /**
     * 특정 기능을 현재 플랜으로 사용할 수 있는지 확인.
     * Local AI(local 모드)는 항상 허용.
     */
    check(feature: keyof typeof PLAN_LIMITS["trial"]): LicenseCheckResult {
        if (this._isDevMachine()) {
            return { allowed: true, plan: "founder", trialDaysLeft: 0 };
        }
        const state   = this._getCachedState() ?? this._buildTrialState();
        const plan    = this.isTrialExpired() ? "expired" : state.plan;
        const limits  = PLAN_LIMITS[plan];
        const daysLeft = this.trialDaysLeft();

        const val = limits[feature];
        const allowed = val === true || (typeof val === "number" && val > 0);

        return { allowed, plan, trialDaysLeft: daysLeft, reason: allowed ? undefined : feature as string };
    }

    /** Cloud 일일 호출 횟수 확인 */
    checkCloudQuota(): { allowed: boolean; used: number; limit: number } {
        if (this._isDevMachine()) {
            return { allowed: true, used: 0, limit: Infinity };
        }
        const state = this._getCachedState() ?? this._buildTrialState();
        const plan  = this.isTrialExpired() ? "expired" : state.plan;
        const limit = PLAN_LIMITS[plan].cloudCallsPerDay;

        const today     = new Date().toISOString().slice(0, 10);
        const key       = `ceviz.cloudCalls.${today}`;
        const used: number = this.globalState.get<number>(key, 0);

        return { allowed: used < limit, used, limit };
    }

    /** Cloud 호출 1회 기록 */
    recordCloudCall(): void {
        const today = new Date().toISOString().slice(0, 10);
        const key   = `ceviz.cloudCalls.${today}`;
        const used  = this.globalState.get<number>(key, 0);
        this.globalState.update(key, used + 1);
        // 3일치 이상 데이터 정리
        this._pruneOldCallCounts();
    }

    private _pruneOldCallCounts(): void {
        const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
        // globalState는 key 열거 API 없음 — 알려진 날짜 패턴만 삭제
        for (let d = 0; d < 7; d++) {
            const date = new Date(Date.now() - (d + 3) * 86_400_000).toISOString().slice(0, 10);
            if (date < cutoff) {
                this.globalState.update(`ceviz.cloudCalls.${date}`, undefined);
            }
        }
    }

    // ── 구매 넛지 ─────────────────────────────────────────────────────────────

    /**
     * 현재 시점에 표시해야 할 넛지 타입을 반환.
     * null = 표시 안 함.
     */
    getPendingNudge(): "welcome" | "d7" | "d2" | "expired" | null {
        if (this._isDevMachine()) { return null; }
        const state = this._getCachedState() ?? this._buildTrialState();
        if (state.plan !== "trial") { return null; }

        const shown: string[] = this.globalState.get<string[]>(SHOWN_NUDGE_GKEY, []);
        const daysLeft        = this.trialDaysLeft();

        if (!shown.includes("welcome")) { return "welcome"; }
        if (daysLeft <= 7 && !shown.includes("d7"))  { return "d7"; }
        if (daysLeft <= 2 && !shown.includes("d2"))  { return "d2"; }
        if (daysLeft <= 0 && !shown.includes("expired")) { return "expired"; }
        return null;
    }

    markNudgeShown(nudge: string): void {
        const shown = this.globalState.get<string[]>(SHOWN_NUDGE_GKEY, []);
        if (!shown.includes(nudge)) {
            this.globalState.update(SHOWN_NUDGE_GKEY, [...shown, nudge]);
        }
    }

    // ── LemonSqueezy API ──────────────────────────────────────────────────────

    /** 라이선스 키 활성화 */
    async activate(rawKey: string): Promise<ActivateResult> {
        const key = rawKey.trim().toUpperCase();
        if (!isValidKeyFormat(key)) {
            return { ok: false, error: "라이선스 키 형식이 올바르지 않습니다. (예: XXXX-XXXX-XXXX-XXXX)" };
        }

        try {
            const res = await axios.post(
                `${LS_API_BASE}/activate`,
                new URLSearchParams({
                    license_key:   key,
                    instance_name: `CEVIZ-${this.machineId.slice(0, 8)}`,
                }),
                {
                    headers: { Accept: "application/json" },
                    timeout: 10_000,
                    validateStatus: (s) => s < 500,
                }
            );

            if (!res.data?.activated && !res.data?.data?.license_key) {
                const msg = res.data?.error ?? res.data?.message ?? "활성화 실패";
                return { ok: false, error: this._translateLsError(msg) };
            }

            const plan = planFromVariantName(
                res.data?.data?.meta?.variant_name ?? res.data?.meta?.variant_name ?? ""
            );
            const instanceId: string = res.data?.data?.instance?.id ?? res.data?.instance?.id ?? "";

            const state: LicenseState = {
                plan,
                keyMasked:       maskKey(key),
                deviceId:        this.machineId,
                activatedAt:     new Date().toISOString(),
                lastValidatedAt: new Date().toISOString(),
                expiresAt:       null,
                trialStartDate:  this.globalState.get<string>(TRIAL_START_GKEY) ?? null,
                instanceId,
                variantId:       res.data?.data?.meta?.variant_id?.toString() ?? null,
            };

            await this.secrets.store(SECRET_KEY, key);
            await this.globalState.update(STATE_GKEY, state);
            return { ok: true, plan };

        } catch (e: any) {
            if (e.code === "ENOTFOUND" || e.code === "ECONNREFUSED") {
                return { ok: false, error: "네트워크에 연결할 수 없습니다. 인터넷 연결을 확인하세요." };
            }
            return { ok: false, error: e.message ?? "알 수 없는 오류" };
        }
    }

    /** 라이선스 재검증 (7일마다 백그라운드 실행) */
    async revalidate(): Promise<void> {
        if (this._isDevMachine()) { return; }
        const state = this._getCachedState();
        if (!state || state.plan === "trial" || !state.instanceId) { return; }

        const daysSince = (Date.now() - new Date(state.lastValidatedAt).getTime()) / 86_400_000;
        if (daysSince < REVALIDATE_DAYS) { return; }

        const key = await this.secrets.get(SECRET_KEY);
        if (!key) { return; }

        try {
            const res = await axios.post(
                `${LS_API_BASE}/validate`,
                new URLSearchParams({ license_key: key, instance_id: state.instanceId }),
                { headers: { Accept: "application/json" }, timeout: 10_000,
                  validateStatus: (s) => s < 500 }
            );

            const valid: boolean = res.data?.valid ?? false;

            if (valid) {
                const updated: LicenseState = { ...state, lastValidatedAt: new Date().toISOString() };
                await this.globalState.update(STATE_GKEY, updated);
            } else {
                // 오프라인 허용 기간 내인지 확인
                if (daysSince > OFFLINE_GRACE_DAYS) {
                    const degraded: LicenseState = { ...state, plan: "expired" };
                    await this.globalState.update(STATE_GKEY, degraded);
                }
            }
        } catch {
            // 네트워크 실패 시 캐시 유지 (OFFLINE_GRACE_DAYS 범위 내)
            if (daysSince > OFFLINE_GRACE_DAYS) {
                // JWT 폴백: 오프라인 서명 검증으로 만료 방지
                const jwtFallback = await this._tryJwtFallback(state);
                if (!jwtFallback) {
                    const degraded: LicenseState = { ...state, plan: "expired" };
                    await this.globalState.update(STATE_GKEY, degraded);
                }
            }
        }
    }

    /** 오프라인 유예 초과 시 저장된 JWT로 만료 방지 */
    private async _tryJwtFallback(state: LicenseState): Promise<boolean> {
        try {
            const jwt = await this.secrets.get(JWT_SECRET_KEY);
            if (!jwt) { return false; }
            const result = await this.verifyOfflineJwt(jwt);
            if (result.ok) {
                // JWT 유효 → 마지막 검증 시각 갱신 (만료 카운트 리셋)
                const updated: LicenseState = { ...state, lastValidatedAt: new Date().toISOString() };
                await this.globalState.update(STATE_GKEY, updated);
                return true;
            }
        } catch {}
        return false;
    }

    /** 라이선스 비활성화 (기기 이전) */
    async deactivate(): Promise<{ ok: boolean; error?: string }> {
        const state = this._getCachedState();
        const key   = await this.secrets.get(SECRET_KEY);
        if (!state?.instanceId || !key) {
            return { ok: false, error: "활성화된 라이선스가 없습니다." };
        }

        try {
            await axios.post(
                `${LS_API_BASE}/deactivate`,
                new URLSearchParams({ license_key: key, instance_id: state.instanceId }),
                { headers: { Accept: "application/json" }, timeout: 10_000 }
            );
        } catch { /* 로컬 상태는 항상 제거 */ }

        await this.secrets.delete(SECRET_KEY);
        await this.globalState.update(STATE_GKEY, undefined);
        await this.clearStoredJwt(); // JWT도 함께 삭제
        return { ok: true };
    }

    // ── JWT 발급 요청 (PN40 경유) ─────────────────────────────────────────────

    /**
     * 활성화 성공 후 PN40 서버에서 오프라인 JWT를 발급받아 SecretStorage에 저장.
     * 실패해도 활성화 결과에 영향 없음 (백그라운드 실행).
     */
    async fetchAndStoreJwt(serverUrl: string): Promise<boolean> {
        if (this._isDevMachine()) { return false; }
        const key   = await this.secrets.get(SECRET_KEY);
        const state = this._getCachedState();
        if (!key || !state || state.plan === "trial") { return false; }

        try {
            const res = await axios.post(
                `${serverUrl}/license/issue-jwt`,
                {
                    license_key:  key,
                    machine_id:   this.machineId,
                    instance_id:  state.instanceId ?? "",
                },
                {
                    headers: { Accept: "application/json" },
                    timeout: 15_000,
                    validateStatus: (s) => s < 500,
                }
            );

            const jwt: string | undefined = res.data?.jwt;
            if (!jwt) { return false; }

            await this.secrets.store(JWT_SECRET_KEY, jwt);
            await this.globalState.update(JWT_FETCHED_GKEY, new Date().toISOString());
            return true;
        } catch {
            return false;
        }
    }

    /** JWT 갱신이 필요한지 (30일 주기) */
    shouldRefreshJwt(): boolean {
        const last = this.globalState.get<string>(JWT_FETCHED_GKEY);
        if (!last) { return true; }
        const daysSince = (Date.now() - new Date(last).getTime()) / 86_400_000;
        return daysSince >= JWT_REFRESH_DAYS;
    }

    /** 라이선스 비활성화 시 JWT도 삭제 */
    async clearStoredJwt(): Promise<void> {
        await this.secrets.delete(JWT_SECRET_KEY);
        await this.globalState.update(JWT_FETCHED_GKEY, undefined);
    }

    // ── 오프라인 JWT 폴백 (Task 6) ────────────────────────────────────────────

    /**
     * LemonSqueezy API가 불가할 때 JWT 토큰으로 오프라인 검증.
     * JWT는 구매 완료 후 PN40 webhook이 생성해 Extension에 전달.
     * RS256 서명 검증 (Node.js 내장 crypto, 외부 라이브러리 불필요).
     */
    async verifyOfflineJwt(token: string): Promise<ActivateResult> {
        try {
            const [headerB64, payloadB64, sigB64] = token.split(".");
            if (!headerB64 || !payloadB64 || !sigB64) {
                return { ok: false, error: "JWT 형식 오류" };
            }

            // 서명 검증
            const data      = `${headerB64}.${payloadB64}`;
            const sigBuf    = Buffer.from(sigB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
            const isValid   = crypto.createVerify("RSA-SHA256")
                .update(data)
                .verify(RSA_PUBLIC_KEY_PEM, sigBuf);

            if (!isValid) {
                return { ok: false, error: "JWT 서명 검증 실패" };
            }

            const payload = JSON.parse(
                Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
            );

            // 만료 확인
            if (payload.exp && Date.now() / 1000 > payload.exp) {
                return { ok: false, error: "JWT가 만료되었습니다. 온라인 재검증이 필요합니다." };
            }

            // 기기 ID 확인
            if (payload.device_id && payload.device_id !== this.machineId) {
                return { ok: false, error: "이 기기에서 활성화된 라이선스가 아닙니다." };
            }

            const plan: LicensePlan = payload.plan ?? "personal";
            const state: LicenseState = {
                plan,
                keyMasked:       payload.key_masked ?? "****",
                deviceId:        this.machineId,
                activatedAt:     payload.iat ? new Date(payload.iat * 1000).toISOString() : new Date().toISOString(),
                lastValidatedAt: new Date().toISOString(),
                expiresAt:       payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
                trialStartDate:  this.globalState.get<string>(TRIAL_START_GKEY) ?? null,
                instanceId:      payload.instance_id ?? null,
                variantId:       payload.variant_id?.toString() ?? null,
            };

            await this.globalState.update(STATE_GKEY, state);
            return { ok: true, plan };

        } catch (e: any) {
            return { ok: false, error: `JWT 검증 오류: ${e.message}` };
        }
    }

    // ── 상태 조회 ─────────────────────────────────────────────────────────────

    getCurrentPlan(): LicensePlan {
        if (this._isDevMachine()) { return "founder"; }
        const state = this._getCachedState();
        if (!state)                 { return "trial"; }
        if (this.isTrialExpired() && state.plan === "trial") { return "expired"; }
        return state.plan;
    }

    getState(): LicenseState {
        return this._getCachedState() ?? this._buildTrialState();
    }

    /** webview로 전송할 요약 정보 */
    getSummary(): {
        plan: LicensePlan;
        planLabel: string;
        trialDaysLeft: number;
        keyMasked: string;
        activatedAt: string;
        lastValidatedAt: string;
        deviceId: string;
    } {
        if (this._isDevMachine()) {
            return {
                plan:            "founder",
                planLabel:       PLAN_LABELS["founder"],
                trialDaysLeft:   0,
                keyMasked:       "DEV-****-****-FREE",
                activatedAt:     "2026-01-01T00:00:00.000Z",
                lastValidatedAt: new Date().toISOString(),
                deviceId:        this.machineId,
            };
        }
        const state = this.getState();
        const plan  = this.getCurrentPlan();
        return {
            plan,
            planLabel:       PLAN_LABELS[plan],
            trialDaysLeft:   this.trialDaysLeft(),
            keyMasked:       state.keyMasked,
            activatedAt:     state.activatedAt,
            lastValidatedAt: state.lastValidatedAt,
            deviceId:        this.machineId,
        };
    }

    // ── LemonSqueezy 오류 메시지 한국어 변환 ──────────────────────────────────

    private _translateLsError(msg: string): string {
        const m = msg.toLowerCase();
        if (m.includes("already activated") || m.includes("limit"))
            { return "기기 수 한도를 초과했습니다. 기존 기기에서 비활성화 후 다시 시도하세요."; }
        if (m.includes("invalid") || m.includes("not found"))
            { return "유효하지 않은 라이선스 키입니다. 키를 다시 확인하세요."; }
        if (m.includes("expired"))
            { return "만료된 라이선스 키입니다."; }
        if (m.includes("disabled") || m.includes("suspended"))
            { return "비활성화된 라이선스입니다. 지원팀에 문의하세요."; }
        return msg;
    }
}

// ── 플랜 표시명 ───────────────────────────────────────────────────────────────

export const PLAN_LABELS: Record<LicensePlan, string> = {
    trial:    "체험판",
    personal: "Personal",
    pro:      "Pro",
    founder:  "Lifetime Founder ⭐",
    expired:  "만료됨",
};

export const PLAN_PRICES: Record<Exclude<LicensePlan, "trial" | "expired">, string> = {
    personal: "$49",
    pro:      "$99",
    founder:  "$149",
};

/** 구매 URL (플레이스홀더 — LEMONSQUEEZY-SETUP.md 참조) */
export const STORE_URL = {
    personal: "https://LEMONSQUEEZY_STORE_URL/checkout/buy/LEMONSQUEEZY_PRODUCT_ID_PERSONAL",
    pro:      "https://LEMONSQUEEZY_STORE_URL/checkout/buy/LEMONSQUEEZY_PRODUCT_ID_PRO",
    founder:  "https://LEMONSQUEEZY_STORE_URL/checkout/buy/LEMONSQUEEZY_PRODUCT_ID_FOUNDER",
} as const;
