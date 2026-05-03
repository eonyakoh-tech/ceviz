# CEVIZ Design System — design.md

> **AI 코딩 지침**: 이 파일을 참조하면 CEVIZ webview UI를 생성·수정할 때 디자인 일관성을 보장합니다.
> `@design.md` 한 줄로 Claude/Cursor가 아래 토큰 전체를 인식합니다.
> W3C DTCG(Design Tokens Community Group) 형식 준수.

---

## 1. Color (색상)

### 1-1. VS Code 테마 연동 토큰 (자동 다크/라이트 대응)

```json
{
  "color-bg-sidebar":      { "value": "var(--vscode-sideBar-background)",                "description": "사이드바 전체 배경" },
  "color-bg-section-hdr":  { "value": "var(--vscode-sideBarSectionHeader-background)",   "description": "섹션 헤더 배경 (hdr, tabs)" },
  "color-bg-editor":       { "value": "var(--vscode-editor-background)",                 "description": "오버레이·다이얼로그 배경" },
  "color-bg-inactive-sel": { "value": "var(--vscode-editor-inactiveSelectionBackground)","description": "어시스턴트 버블, 카드 배경" },
  "color-bg-input":        { "value": "var(--vscode-input-background)",                  "description": "입력 필드 배경" },
  "color-fg":              { "value": "var(--vscode-foreground)",                         "description": "기본 텍스트" },
  "color-fg-desc":         { "value": "var(--vscode-descriptionForeground)",              "description": "보조 텍스트, 메타, 라벨" },
  "color-accent":          { "value": "var(--vscode-focusBorder)",                       "description": "포커스·활성 강조색 (버튼 ON, 탭 하이라이트)" },
  "color-btn-primary-bg":  { "value": "var(--vscode-button-background)",                 "description": "주요 버튼 배경" },
  "color-btn-primary-fg":  { "value": "var(--vscode-button-foreground)",                 "description": "주요 버튼 텍스트" },
  "color-btn-hover":       { "value": "var(--vscode-button-hoverBackground)",            "description": "주요 버튼 호버" },
  "color-btn-secondary-bg":{ "value": "var(--vscode-button-secondaryBackground)",        "description": "보조 버튼 배경" },
  "color-btn-secondary-fg":{ "value": "var(--vscode-button-secondaryForeground)",        "description": "보조 버튼 텍스트" },
  "color-border":          { "value": "var(--vscode-panel-border)",                      "description": "구분선, 테두리 기본값" },
  "color-list-hover":      { "value": "var(--vscode-list-hoverBackground)",              "description": "리스트 아이템 호버" },
  "color-list-active-bg":  { "value": "var(--vscode-list-activeSelectionBackground)",    "description": "현재 선택 세션 배경" },
  "color-list-active-fg":  { "value": "var(--vscode-list-activeSelectionForeground)",    "description": "현재 선택 세션 텍스트" },
  "color-link":            { "value": "var(--vscode-textLink-foreground)",               "description": "위키배지, 링크 색상" },
  "color-toolbar-hover":   { "value": "var(--vscode-toolbar-hoverBackground)",           "description": "아이콘 버튼 호버 배경" },
  "color-badge-bg":        { "value": "var(--vscode-badge-background)",                  "description": "배지 배경" },
  "color-badge-fg":        { "value": "var(--vscode-badge-foreground)",                  "description": "배지 텍스트" },
  "color-dropdown-bg":     { "value": "var(--vscode-dropdown-background)",               "description": "드롭다운 메뉴 배경" },
  "color-dropdown-border": { "value": "var(--vscode-dropdown-border)",                   "description": "드롭다운 테두리" }
}
```

### 1-2. CEVIZ 하드코딩 시맨틱 토큰

```json
{
  "color-status-online":   { "value": "#4c4",    "description": "온라인 닷, 성공 상태" },
  "color-status-offline":  { "value": "#c44",    "description": "오프라인 닷, 위험/삭제" },
  "color-rag-blue":        { "value": "#5a9fd4", "description": "RAG 히트 강조, 세션 핀, Cloud 라우팅 배지, 모델 아이콘 텍스트" },
  "color-success-green":   { "value": "#4caf50", "description": "예산 바 정상, Local 라우팅 배지" },
  "color-warn-amber":      { "value": "#d4a017", "description": "예산 바 경고 (60–85%)" },
  "color-danger-red":      { "value": "#e05050", "description": "예산 바 위험 (>85%), 에러 텍스트" },
  "color-stop-red":        { "value": "#b33",    "description": "Stop 버튼 배경" },
  "color-stop-red-hover":  { "value": "#d44",    "description": "Stop 버튼 호버" },
  "color-cost-teal":       { "value": "#7ec",    "description": "토큰 비용 텍스트 ($0.0000)" },
  "color-model-icon-bg":   { "value": "#1e3a5f", "description": "모델 아이콘 배경 (다크 네이비)" },
  "color-model-icon-fg":   { "value": "#7ec8e3", "description": "모델 아이콘 텍스트" },
  "color-cat-label":       { "value": "#d16969", "description": "드롭다운 카테고리 라벨" },
  "color-req-asterisk":    { "value": "#e05050", "description": "필수 필드 * 표시" },
  "color-nudge-bg":        { "value": "#3a2800", "description": "라이선스 넛지 배너 배경" },
  "color-nudge-text":      { "value": "#ffe",    "description": "라이선스 넛지 텍스트" },
  "color-nudge-buy-bg":    { "value": "#0a4a8a", "description": "업그레이드 버튼 배경" },
  "color-nudge-buy-fg":    { "value": "#9cf",    "description": "업그레이드 버튼 텍스트" },
  "color-offline-banner-bg":{ "value": "#5a1515","description": "오프라인 배너 배경" },
  "color-offline-banner-fg":{ "value": "#ff9090","description": "오프라인 배너 텍스트" },
  "color-confidence-high": { "value": "#4caf50", "description": "신뢰도 90%+ (녹)" },
  "color-confidence-mid":  { "value": "#d4a017", "description": "신뢰도 60–89% (황)" },
  "color-confidence-low":  { "value": "#e05050", "description": "신뢰도 <60% (적) — 환각 위험" }
}
```

---

## 2. Typography (타이포그래피)

```json
{
  "font-family-ui":    { "value": "var(--vscode-font-family)",        "description": "UI 텍스트 기본 폰트" },
  "font-family-code":  { "value": "var(--vscode-editor-font-family,'monospace')", "description": "코드·위키배지 모노스페이스" },

  "font-size-xs":      { "value": "9px",  "description": "배지, 날짜, 서브라벨" },
  "font-size-xs2":     { "value": "9.5px","description": "라우팅 배지, 토큰 바 Row2" },
  "font-size-sm":      { "value": "10px", "description": "메타 정보, 상태 텍스트" },
  "font-size-md":      { "value": "11px", "description": "드롭다운 아이템, 버튼, 리스트" },
  "font-size-base":    { "value": "12px", "description": "버블 텍스트, 입력창, 기본 바디" },
  "font-size-lg":      { "value": "13px", "description": "브랜드명, 아이콘 버튼, 전송 버튼" },
  "font-size-xl":      { "value": "14px", "description": "전송 버튼 아이콘, 다이얼로그 타이틀" },

  "font-weight-normal": { "value": "400", "description": "기본 텍스트" },
  "font-weight-bold":   { "value": "700", "description": "브랜드, 섹션 타이틀, 스킬명" },
  "font-weight-semi":   { "value": "600", "description": "새 채팅, 저장 버튼" },

  "line-height-bubble": { "value": "1.5", "description": "버블 텍스트 행간" },
  "letter-spacing-label":{ "value": "0.5px","description": "섹션 라벨 자간 (SKILL 등)" },
  "letter-spacing-xs":  { "value": "0.2px","description": "오프라인 배너 자간" }
}
```

---

## 3. Spacing (간격)

> CEVIZ는 4px 기반 스케일을 사용합니다.

```json
{
  "space-1": { "value": "1px", "description": "최소 갭 (세션 목록 아이템 간)" },
  "space-2": { "value": "2px", "description": "아이콘 패딩" },
  "space-3": { "value": "3px", "description": "배지 패딩, 아이콘 버튼 패딩" },
  "space-4": { "value": "4px", "description": "컴팩트 패딩, 탭 패딩, XS 갭" },
  "space-5": { "value": "5px", "description": "버튼 패딩 수평, 갭 S" },
  "space-6": { "value": "6px", "description": "메타 갭, 스킬 패딩" },
  "space-7": { "value": "7px", "description": "버블 패딩 수직" },
  "space-8": { "value": "8px", "description": "채팅 패딩, 표준 패딩 M" },
  "space-9": { "value": "9px", "description": "버블 패딩 수평" },
  "space-10":{ "value": "10px","description": "주요 버튼 패딩 수평" },
  "space-12":{ "value": "12px","description": "드롭다운 아이템 패딩 수평" },
  "space-14":{ "value": "14px","description": "프로젝트 아이템 패딩" },
  "space-20":{ "value": "20px","description": "다이얼로그 내부 패딩" }
}
```

---

## 4. Corners (모서리 곡률)

```json
{
  "radius-xs":   { "value": "2px", "description": "모델 아이콘, 진행바" },
  "radius-sm":   { "value": "3px", "description": "배지, 작은 버튼, 세션 아이템" },
  "radius-md":   { "value": "4px", "description": "입력창, 버튼 기본, 카드" },
  "radius-lg":   { "value": "6px", "description": "에이전트 카드, 컨텍스트 메뉴" },
  "radius-xl":   { "value": "8px", "description": "버블, 드롭다운" },
  "radius-pill": { "value": "10px","description": "모드 버튼, 다이얼로그" },
  "radius-full": { "value": "50%", "description": "상태 닷, 생각 닷" }
}
```

---

## 5. Shadows (그림자)

```json
{
  "shadow-dropdown": { "value": "0 4px 16px rgba(0,0,0,.4)",   "description": "드롭다운 메뉴, 컨텍스트 메뉴" },
  "shadow-dialog":   { "value": "0 12px 40px rgba(0,0,0,.6)",  "description": "모달 다이얼로그 (inbox-dlg 등)" },
  "shadow-focus":    { "value": "0 0 0 1px var(--vscode-focusBorder)", "description": "포커스 링 (ibtn.on)" }
}
```

---

## 6. Borders (테두리)

```json
{
  "border-base":      { "value": "1px solid var(--vscode-panel-border)", "description": "구분선, 카드, 입력창 테두리" },
  "border-focus":     { "value": "1px solid var(--vscode-focusBorder)",  "description": "활성/포커스 테두리" },
  "border-dialog":    { "value": "1.5px solid var(--vscode-focusBorder)","description": "중요 다이얼로그 테두리" },
  "border-wiki":      { "value": "1px solid var(--vscode-textLink-foreground)", "description": "위키링크 배지 테두리" },
  "border-route-local":{ "value": "1px solid #4caf50","description": "Local 라우팅 배지" },
  "border-route-cloud":{ "value": "1px solid #5a9fd4","description": "Cloud 라우팅 배지" },
  "border-rag-hit":   { "value": "2px solid #5a9fd4", "description": "RAG 히트 버블 좌측 강조" }
}
```

---

## 7. Opacity (투명도)

```json
{
  "opacity-muted":    { "value": "0.6",  "description": "보조 아이콘, 마이크 버튼 기본" },
  "opacity-disabled": { "value": "0.7",  "description": "비활성 세션 아이템, 아이콘 버튼" },
  "opacity-overlay":  { "value": "0.55", "description": "오버레이 배경 (proj-overlay 등)" },
  "opacity-heavy-overlay":{ "value": "0.6","description": "중요 다이얼로그 배경" },
  "opacity-actions-hidden":{ "value": "0","description": "메시지 액션 기본 (hover로 표시)" }
}
```

---

## 8. Layout / Sizing (레이아웃 & 크기)

```json
{
  "size-status-dot":   { "value": "6px",  "description": "상태 표시 닷 지름" },
  "size-orch-dot":     { "value": "7px",  "description": "오케스트레이터 상태 닷" },
  "size-model-icon":   { "value": "14px", "description": "모델 아이콘 너비/높이" },
  "size-progress-h":   { "value": "3px",  "description": "진행 바 높이" },
  "size-rag-bar-h":    { "value": "4px",  "description": "RAG 통계 바 높이" },
  "size-budget-bar-h": { "value": "3px",  "description": "월 예산 바 높이" },
  "size-msg-cb":       { "value": "13px", "description": "메시지 체크박스" },
  "size-prompt-min-h": { "value": "238px","description": "프롬프트 입력창 최소/최대 높이" },
  "size-dash-plan-h":  { "value": "80px", "description": "대시보드 플랜 텍스트에어리어" },
  "size-drop-min-w":   { "value": "230px","description": "드롭다운 최소 너비" },
  "size-dialog-max-w": { "value": "min(340px,92vw)", "description": "다이얼로그 최대 너비" },
  "size-sess-list-max-h":{ "value": "80px","description": "세션 목록 최대 높이" },

  "transition-fast":   { "value": ".1s",  "description": "즉각 반응 (act-btn, sitem)" },
  "transition-base":   { "value": ".15s", "description": "기본 전환 (ibtn, toggle, sess-list)" },
  "transition-slow":   { "value": ".3s",  "description": "바 너비 전환 (progress, budget)" },

  "z-overlay":         { "value": "10000","description": "모달/오버레이 최상위" },
  "z-dropdown":        { "value": "9999", "description": "드롭다운 메뉴" },
  "z-ctx-menu":        { "value": "800",  "description": "세션 컨텍스트 메뉴" },
  "z-nudge":           { "value": "350",  "description": "라이선스 넛지 배너" }
}
```

---

## 9. 컴포넌트 패턴 (Component Patterns)

### 버블 (Bubble)
- 사용자: `bg=color-btn-primary-bg`, `radius=8px 8px 2px 8px`, `color=color-btn-primary-fg`
- 어시스턴트: `bg=color-bg-inactive-sel`, `radius=8px 8px 8px 2px`
- 패딩: `7px 9px`, 폰트: `font-size-base(12px)`, 행간: `1.5`

### 아이콘 버튼 (ibtn)
- 기본: `background:none`, `border:1px solid transparent`, `opacity:.7`, `radius:4px`
- 호버: `bg=color-toolbar-hover`, `opacity:1`
- 활성(on): `bg=color-accent`, `color:#fff`, `opacity:1`, `shadow=shadow-focus`

### 배지 (Badge)
- 기본: `bg=color-badge-bg`, `color=color-badge-fg`, `radius:3px`, `padding:0 4px`
- 위키: `border=border-wiki`, `color=color-link`, `cursor:pointer`
- 라우팅 Local: `border=border-route-local`, `color=#4caf50`
- 라우팅 Cloud: `border=border-route-cloud`, `color=#5a9fd4`

### 신뢰도 배지 (Confidence Badge) — P2 신규
- 높음(≥90%): `color=color-confidence-high(#4caf50)`
- 중간(60–89%): `color=color-confidence-mid(#d4a017)`
- 낮음(<60%): `color=color-confidence-low(#e05050)` + 경고 아이콘

### 오버레이 (Overlay)
- `position:fixed`, `inset:0`, `background=rgba(0,0,0,opacity-overlay)`
- `z-index=z-overlay`, `align-items:center`, `justify-content:center`

---

## 10. AI 코딩 가이드라인

1. **VS Code 변수 우선**: 모든 배경·텍스트는 `var(--vscode-*)` 토큰을 우선 사용. 하드코딩은 시맨틱 의미가 있을 때만 (상태 색상, 브랜드 포인트 등).
2. **폰트 사이즈**: 웹뷰 내 최소 `9px`, 기본 `12px`. VS Code 패널은 공간이 협소하므로 압축 레이아웃 유지.
3. **간격**: `4px` 기본 단위. 여백은 `space-*` 스케일 준수.
4. **곡률**: 버블 `8px`, 버튼 `4px`, 배지 `3px`. 팝업/다이얼로그는 `10px`.
5. **z-index 계층**: overlay(10000) > dropdown(9999) > ctx-menu(800) > nudge(350) > 기본(auto).
6. **애니메이션**: `transition-base(.15s)` 기본. 바 채우기는 `transition-slow(.3s)`. 중요 액션은 `stopPulse` keyframe.
7. **신뢰도 색상**: 90%+ 녹(`#4caf50`), 60–89% 황(`#d4a017`), <60% 적(`#e05050`).
8. **반응형 없음**: VS Code 사이드바 고정 너비 환경. `min-width:0` + `overflow:hidden` + `text-overflow:ellipsis` 패턴 사용.
