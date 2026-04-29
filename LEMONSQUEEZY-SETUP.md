# CEVIZ — LemonSqueezy 결제 설정 가이드

> 이 파일은 CEVIZ 개발자(eonyakoh)를 위한 LemonSqueezy 계정 설정 가이드입니다.
> 소스코드의 플레이스홀더를 실제 값으로 교체하는 방법을 단계별로 안내합니다.

---

## 1단계: LemonSqueezy 계정 및 스토어 생성

1. [https://app.lemonsqueezy.com](https://app.lemonsqueezy.com) 에서 계정 생성
2. **Store** → **Create Store** → 스토어 이름: `CEVIZ`
3. **Settings → Store** 에서 `LEMONSQUEEZY_STORE_URL` 확인
   - 형식: `https://yourstore.lemonsqueezy.com`

---

## 2단계: 상품(Product) 생성

각 플랜을 별도 상품으로 생성합니다.

### Personal — $49

1. **Products → Add Product**
2. 이름: `CEVIZ Personal`
3. 가격: `$49.00` (일회성)
4. License Key 발급 활성화: ✅ Enable license keys
5. 활성화 제한: `1 device`
6. 저장 후 **Product ID** 복사 → `LEMONSQUEEZY_PRODUCT_ID_PERSONAL`
7. **Checkout URL** 복사 → `STORE_URL.personal`에 사용

### Pro — $99

1. **Products → Add Product**
2. 이름: `CEVIZ Pro`
3. 가격: `$99.00` (일회성)
4. License Key 발급 활성화: ✅
5. 활성화 제한: `3 devices`
6. 저장 후 **Product ID** 복사 → `LEMONSQUEEZY_PRODUCT_ID_PRO`

### Lifetime Founder — $149

1. **Products → Add Product**
2. 이름: `CEVIZ Lifetime Founder`
3. 가격: `$149.00` (일회성)
4. License Key 발급 활성화: ✅
5. 활성화 제한: `Unlimited`
6. 저장 후 **Product ID** 복사 → `LEMONSQUEEZY_PRODUCT_ID_FOUNDER`
7. **수량 제한 100개** 설정 권장 (Founder 한정판)

---

## 3단계: API 키 발급

1. **Settings → API** → **Create API Key**
2. 이름: `CEVIZ Extension`
3. 발급된 키를 안전하게 보관 → `LEMONSQUEEZY_API_KEY`
   - ⚠️ 이 키는 PN40 서버 환경변수에만 저장, 코드에 하드코딩 금지

---

## 4단계: Webhook 설정

1. **Settings → Webhooks → Add Webhook**
2. URL: `https://<your-tailscale-or-public-ip>:8000/license/webhook`
3. Secret: 강력한 랜덤 문자열 생성 → `LEMONSQUEEZY_WEBHOOK_SECRET`

   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(48))"
   ```

4. 이벤트 선택:
   - ✅ `order_created`
   - ✅ `license_key_created`
5. **Save Webhook**

---

## 5단계: PN40 서버 환경변수 설정

```bash
# ~/ceviz/.env 파일 생성 (권한 600)
cat > ~/ceviz/.env <<'EOF'
LEMONSQUEEZY_WEBHOOK_SECRET=<위에서 생성한 시크릿>
LEMONSQUEEZY_API_KEY=<API 키>
TELEGRAM_BOT_TOKEN=<텔레그램 봇 토큰>
TELEGRAM_CHAT_ID=<텔레그램 채팅 ID>
EOF

chmod 600 ~/ceviz/.env
```

systemd 서비스에 EnvironmentFile 추가:

```ini
# ~/.config/systemd/user/ceviz-api.service 수정
[Service]
EnvironmentFile=-%HOME%/ceviz/.env
```

```bash
systemctl --user daemon-reload
systemctl --user restart ceviz-api
```

---

## 6단계: Extension 소스코드 플레이스홀더 교체

### `src/license.ts` — STORE_URL 수정

```typescript
// 파일 하단 STORE_URL 상수를 실제 URL로 교체:
export const STORE_URL = {
    personal: "https://yourstore.lemonsqueezy.com/checkout/buy/<PRODUCT_ID_PERSONAL>",
    pro:      "https://yourstore.lemonsqueezy.com/checkout/buy/<PRODUCT_ID_PRO>",
    founder:  "https://yourstore.lemonsqueezy.com/checkout/buy/<PRODUCT_ID_FOUNDER>",
} as const;
```

---

## 7단계: RSA 키 쌍 생성 (JWT 오프라인 검증용)

```bash
# RSA-2048 키 쌍 생성
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out ~/ceviz/jwt_private.pem
openssl rsa -in ~/ceviz/jwt_private.pem -pubout -out ~/ceviz/jwt_public.pem

# 권한 설정
chmod 600 ~/ceviz/jwt_private.pem
chmod 644 ~/ceviz/jwt_public.pem

# 공개키 내용 확인
cat ~/ceviz/jwt_public.pem
```

`src/license.ts`의 `RSA_PUBLIC_KEY_PEM` 상수를 위 공개키로 교체:

```typescript
const RSA_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
<여기에 jwt_public.pem 내용 전체 붙여넣기>
-----END PUBLIC KEY-----`;
```

### JWT 토큰 발급 (구매 완료 시 PN40에서 생성)

```python
# PN40에서 실행 (jwt_private.pem 필요)
import jwt, datetime
payload = {
    "iss": "ceviz",
    "iat": datetime.datetime.utcnow(),
    "exp": datetime.datetime.utcnow() + datetime.timedelta(days=365),
    "plan": "personal",           # trial | personal | pro | founder
    "device_id": "<machineId>",   # vscode.env.machineId
    "instance_id": "<ls_id>",     # LemonSqueezy instance ID
    "key_masked": "XXXX-****-****-XXXX",
}
with open("/home/user/ceviz/jwt_private.pem") as f:
    private_key = f.read()
token = jwt.encode(payload, private_key, algorithm="RS256")
print(token)
```

---

## 8단계: 빌드 및 재패키징

```bash
cd ~/ceviz-ui/ceviz
npm run compile
npx vsce package
```

---

## 9단계: Telegram Bot 설정 (선택)

구매 알림을 받으려면:

1. [@BotFather](https://t.me/BotFather) 에서 봇 생성 → `TELEGRAM_BOT_TOKEN` 획득
2. 봇에게 메시지를 보낸 후:
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
   응답에서 `chat.id` 확인 → `TELEGRAM_CHAT_ID`

---

## 10단계: Webhook 동작 확인

```bash
# PN40에서 테스트 (서명은 빈 문자열 — dev 환경에서만)
curl -X POST http://localhost:8000/license/webhook \
     -H "Content-Type: application/json" \
     -H "X-Signature: $(echo -n '{}' | openssl dgst -sha256 -hmac '<SECRET>' | cut -d' ' -f2)" \
     -d '{
       "meta": {"event_name": "order_created"},
       "data": {"attributes": {
         "order_number": 1001,
         "total_formatted": "$49.00",
         "user_email": "test@example.com",
         "first_order_item": {"variant_name": "Personal"}
       }}
     }'

# 설정 상태 확인
curl http://localhost:8000/license/webhook/status
```

---

## 플레이스홀더 요약

| 플레이스홀더 | 위치 | 설명 |
|-------------|------|------|
| `LEMONSQUEEZY_STORE_URL` | `src/license.ts` STORE_URL | 스토어 도메인 |
| `LEMONSQUEEZY_PRODUCT_ID_PERSONAL` | `src/license.ts` STORE_URL | Personal 상품 checkout ID |
| `LEMONSQUEEZY_PRODUCT_ID_PRO` | `src/license.ts` STORE_URL | Pro 상품 checkout ID |
| `LEMONSQUEEZY_PRODUCT_ID_FOUNDER` | `src/license.ts` STORE_URL | Founder 상품 checkout ID |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | PN40 환경변수 | Webhook HMAC 시크릿 |
| `LEMONSQUEEZY_API_KEY` | PN40 환경변수 | LemonSqueezy REST API 키 |
| `TELEGRAM_BOT_TOKEN` | PN40 환경변수 | 텔레그램 봇 토큰 |
| `TELEGRAM_CHAT_ID` | PN40 환경변수 | 텔레그램 수신 채팅 ID |
| `RSA_PUBLIC_KEY_PEM` | `src/license.ts` | JWT 서명 검증용 공개키 |

---

> 모든 시크릿은 환경변수 또는 파일(chmod 600)에만 저장하고,
> git에 절대 커밋하지 마세요. `.gitignore`에 `*.pem`, `.env`가 등록되어 있습니다.
