---
type: 2026-04-17T08:44:00
---

[[기능 설명_UI&UX_Ugrade_Update_CEBVIZ]]

# VS Code의 좌측 사이드바에서 호두 모양의 View Icon을 누르면 Ceviz를 작동시킬 수 있다.
![[Pasted image 20260417142245.png]]


# 드롭다운 메뉴를 통해 Cloud-based AI 모델을 고를 수 있다.
![[Pasted image 20260420051411.png|312]]
- 기본적으로 Gemma 4 E4B, Gemma 4 E2B를 선택할 수 있도록 해놓았다.
- 드롭다운 메뉴를 통해 AI 모델을 선택할 수 있다.
	- Local에는 기본적으로 Gemma 4 E4B, Gemma 4 E2B를 선택할 수 있도록 해놓았으며 추후 다른 AI 모델을 Local에 설치하면 선택할 수 있도록 목록에 뜬다.
	- Cloud-based AI 모델에는 Claude를 기본으로 해놓고 있으며, 추후 사용자가 원할 때 Cloud-based AI 모델 추가하면 마찬가지로 선택할 수 있도록 목록에 뜬다. Cloud-based AI 모델이 여러개 일 경우에 기본 설정을 바꿀 수 있다. 초기 기본 설정은 Claude이다. 
	- Hybrid에 속한 것을 선택하면 고난도 task라고 판단이 되었을 때 자동적으로 Claud-based AI 모델 중에서 기본 설정 된 AI모델이 작동을 한다.


# 사용자의 지식 신경망과 연결
![[Pasted image 20260417091100.png|112]]
- GitHub에서 사용자의 Obsidian의 지식들을 모두 연결해주는 기능을 한다.


# AI엔진을 변경할 수 있다.
![[Pasted image 20260417085103.png]]
- 기어 스틱(Gear Stick) View Icon을 누르면 ollama, LM Studio 엔진이 드롭다운 메뉴 형식으로 나온다. 하나를 선택 할 수 있다.


# 영어 프롬프트로만 작성
![[Pasted image 20260417090716.png|114]]
- 영어로만 프롬프트를 작성할 수 있다.
- 사용자의 영어 습득의 튜터 역할을 해주는 기능이다.
- 사용자의 영어 수준에 전혀 영향 받지 않는다. 오히려 '영어 튜터'가 사용자의 영어 수준을 끌어 올려주기 위해 수준별 튜터 역할을 해준다.
- 사용자가 어떻게 얘기하든 잘 알아듣고 이해한 의미를 사용자가 검토할 수 있도록 feedback해준다. 그리고 정확한 영어로 수정해준다.


# AI Agent Orchestration Dashboard (멀티 에이전트 통합 관제 센터)
![[Pasted image 20260419175137.png]]
- 이 버튼을 누르면 제시된 프롬프트에 맞추어 특정 목표를 달성하기 위해 투입된 **여러 명의 AI 에이전트(연구원, 작가, 코드 검토자 등)**의 상태, 상호작용, 비용, 성과를 한눈에 확인하고 제어하는 인터페이스 즉, AI Agent Orchestration Dashboard 제작이 작동된다.
-  이 시스템은 **추가적인 토큰 소모 없이** 각 에이전트의 역할을 최적화하여 복잡한 게임 제작이나 데이터 분석에서 높은 완성도를 보여준다.
- [[AI Agent Orchestration Dashboard (멀티 에이전트 통합 관제 센터)(Soti-Skill) 시스템 설계 전략 및 설치 가이드]]

# Skill 목록으로 간다. Skill을 '제작, 추가, 변경, 삭제'할 수 있다.
![[Pasted image 20260417090518.png|217]]
- 이 view icon을 클릭하면 skill 창을 열어준다. 여기서 카테고르별로 정리된 skill들을 볼 수 있다.
- skill에 대해서 '제작,  추가, 변경, 삭제' 기능들이 있다.


# Cloud-based AI 모델을 사용할 때는 '토큰 사용량'의 정보를 제공하는 창과 '업무 처리 방법 학습시키기 버튼'이 생긴다.
![[Pasted image 20260419173254.png]]

# 업무 처리 방법 학습시키기 버튼
![[Pasted image 20260417142535.png]]
- Cloud-based AI 모델을 사용하여 고난도 task를 성공적으로 처리했을 때, Cloud-based AI 모델의 일 처리 방법을 내가 육성시키고 훈련시키는 My AI Creations의 모델들에게 학습시키는 버튼이다.
- 이 버튼을 눌렀을 때 Cloud-based AI는 내가 선택한 Gemma 4 E4B나 Gemma 4 E2B를 학습시킬 수 있다. 그러나 반대 방향으로는 절대 금지이다. 즉, My AI Creations는 Cloud-based AI에게 어떠한 데이터 정보도 주지 않는다.


# Hybrid
![[Pasted image 20260417093134.png]]
- Local일 때는 Local AI로만 작동한다. 절대 인터넷에서 가져오지 않는다. 다만, 고난도 task를 사용자가 요청했을 경우에는 '솔직히' Cloud-based AI를 사용해야 할 것 같다고 말해준다.
- Hybrid일 때는 Local로 사용하다가 고난도 task를 꼭 사용해야 할 경우에는 자동으로 사용자가 우선으로 선택해놓은 Cloud-based AI로 접속해서 task를 수행한다. 이 기능은 Hybrid로 설정했을 때 수행하기 전에 어떤 AI모델로 설정해야하는지 최초 설정을 물어본다. 물론, 어느 시점이든지 사용자는 프롬프트로 Cloud-based AI 모델 변경이 가능하다.



# 병렬 작업이 가능하다.
![[Pasted image 20260417142401.png]]
- + 버튼을 눌러서 New Chat을 불러올 수 있다.