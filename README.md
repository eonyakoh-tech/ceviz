# CEVIZ

🌰 Local Personal Hybrid AI — VS Code Extension

## 기능
- Local AI (Ollama) / Cloud AI (Claude) / Hybrid 자동 전환
- Soti-Skill 멀티 에이전트 오케스트레이션 대시보드
- 영어 튜터 모드
- 세션 관리 및 병렬 작업

## 설치 후 설정

VS Code에 `.vsix`를 설치한 뒤 아래 명령을 실행하세요 (Ubuntu/Debian, sudo 필요):

```bash
bash scripts/post-install.sh
```

스크립트가 자동으로 수행하는 작업:
- open-webui 서비스 중지 및 비활성화
- ripgrep(`rg`) 없으면 자동 설치
- Ollama 미설치 시 설치 안내
- ceviz-api systemd 서비스 상태 확인

## 설정
- `ceviz.serverIp`: PN40 서버 Tailscale IP
