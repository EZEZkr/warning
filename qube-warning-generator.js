// ===== 데이터 구조 =====

const violationConfig = {
  chitchat: {
    name: "학습 무관 사담",
    targets: ["master", "student"],
    stages: ["first", "repeat", "permanent"],
  },
  qSharing: {
    name: "의도적 Q 나눔",
    targets: ["master", "student"],
    stages: ["permanent"],
  },
  poorAnswer: {
    name: "부실 답변 / 답변 도용",
    targets: ["master"],
    stages: ["first"],
  },
  hashtag: {
    name: "부적절 해시태그",
    targets: ["master", "student"],
    stages: ["first"],
  },
};

// 부실 답변 / 답변 도용의 도입부 프리셋. 상황에 맞는 것을 고르거나 직접 입력으로 대체한다.
const introPresets = {
  poorAnswer: {
    p1: "안녕하세요, 큐브입니다.\n\n마스터님의 답변 활동에 대해 다수의 답변 신고가 누적되어 안내드립니다.",
    p2: "안녕하세요, 큐브입니다.\n\n수 차례의 경고 및 계정 정지에도 불구하고, 마스터님의 답변활동에 대한 다수의 신고가 누적되어 안내드립니다.",
    p3: "안녕하세요, 큐브입니다. 기존 경고에도 불구하고, 마스터님의 답변 활동에 대한 다수의 신고가 누적되어 안내드립니다.",
    p4: "안녕하세요, 큐브입니다. 마스터님의 전체 답변에 대한 모니터링 결과를 안내드립니다.",
  },
};

// 사유별 상세 설명. 실제 운영 문구가 확인된 사유만 등록되어 있으며,
// 등록된 사유가 선택된 경우에만 번호가 매겨진 설명 문단이 자동으로 붙는다.
const reasonExplanations = {
  "불친절한 답변":
    "큐브에는 상위권부터 하위권까지 다양한 학생군이 있습니다. 학생들마다 학업 수준이 다르다는 점을 반드시 참고하시어 친절하고 상세한 답변을 성실하게 해 주시기 바랍니다.",
  "재답변 부재":
    "마스터님께서 학생들의 재질문에 답장을 해 주지 않을 경우, 학생들은 궁금증을 해소할 길이 없습니다. 답변활동 시 최초의 질문에만 답해주는 것이 아닌 학생의 궁금증이 모두 해결될 때까지 푸시 알림을 좀 더 신경쓰셔서 답변이 누락되는 일이 없도록 주의해 주세요.",
  "정확히 답변 안 함":
    "학생들의 질문을 선점한 후 오랜 시간 답장을 해 주지 않을 경우, 학생들은 궁금증을 해소할 길이 없습니다. 큐브는 실시간 질문답변 앱으로, 반드시 답변이 가능한 상황에서 질문 열람 및 성실한 답변을 제공해 주세요.",
  "해설지/캡처본 답변":
    "큐브에서는 본인이 작성한 풀이가 아닌 타인의 답변, 해설지, 캡쳐본 등 답변을 도용하는 행위는 절대 금지하고 있습니다. 이는 부정활동에 해당되니, 꼭 본인이 작성한 풀이로 답변해 주시기 바랍니다.",
};

// ===== 템플릿 생성 로직 =====
// 정지 조치와 입금/환급 요청은 위반 유형과 무관하게 독립적으로 선택할 수 있는
// 추가 문단이며, 기본 문구(위반 유형별 안내) 뒤에 필요한 것만 덧붙여 생성된다.
// 둘 다 선택된 경우 실제 운영 관행에 맞춰 입금/환급 문단 → 정지 문단 순으로 붙는다.

class WarningGenerator {
  constructor() {
    this.state = {
      violationType: null,
      target: "master",
      masterName: "",
      studentName: "",
      violationCount: "",
      recoveredPoints: "",
      includeSuspend: false,
      suspendStartMode: "date",
      suspendStartDate: "",
      suspendDuration: "",
      suspendDurationCustom: "",
      includePayment: false,
      financeType: "payment",
      illegalPoints: "",
      deductedAmount: "",
      undeductedAmount: "",
      depositAmount: "",
      paymentDueDate: "",
      cancelledRefundDate: "",
      cancelledRefundAmount: "",
      introChoice: "p1",
      introCustomText: "",
      reasons: [],
      customReasonLabel: "",
      customReasonExplanation: "",
      specialFlags: [],
    };
  }

  generateTemplate() {
    const { violationType, target } = this.state;

    if (!violationType) {
      return null;
    }

    const config = violationConfig[violationType];
    const stage = this.getStage(config);

    const baseText = this.getBaseText(violationType, target, stage);
    if (!baseText) return null;

    const parts = [baseText];

    const reasonsBlock = this.getReasonsBlock();
    if (reasonsBlock) {
      parts.push(reasonsBlock);
    }

    if (violationType === "poorAnswer") {
      const closing = this.buildPoorAnswerClosing();
      if (closing) parts.push(closing);
    }

    if (this.state.includePayment) {
      parts.push(this.getPaymentClause());
    }

    if (this.state.includeSuspend) {
      parts.push(this.getSuspendClause());
    }

    parts.push("감사합니다.");

    return this.replaceVariables(parts.join("\n\n"));
  }

  // 위반 사유는 위반 유형과 무관하게 선택 시에만 문단으로 붙는다.
  // 프리셋 사유는 그대로 두고, 직접 입력한 사유만 눈에 띄게 표시한다.
  getReasonsBlock() {
    const presetReasons = [...this.state.reasons];
    const hasCustom = Boolean(this.state.customReasonLabel);

    if (presetReasons.length === 0 && !hasCustom) return "";

    const reasonParts = presetReasons.map((reason) => `[${this.escapeHtml(reason)}]`);
    if (hasCustom) {
      reasonParts.push(`[${this.mark(this.state.customReasonLabel)}]`);
    }
    const reasonText = reasonParts.join(", ");

    let block = `회원님은 ${reasonText} 등을 포함하여 총 {count}건의 부정활동을 하신 것으로 확인되었습니다.`;

    // 영구정지는 활동 자체가 불가능해지므로, "이렇게 주의해 달라"는 상세 설명 문단은
    // 더 이상 의미가 없어 붙이지 않는다.
    if (!this.willDuplicatePermanentSuspend()) {
      const explanationLines = this.buildReasonExplanationLines();
      if (explanationLines.length) {
        block += `\n\n${explanationLines.map((line, i) => `${i + 1}. ${line}`).join("\n")}`;
      }
    }

    return block;
  }

  // "재답변 부재"와 "정확히 답변 안 함"을 함께 선택하면, 두 사유가 사실상 같은
  // 문제(제때 답변하지 않음)를 가리키므로 각각의 설명 대신 통합된 설명 하나만 사용한다.
  buildReasonExplanationLines() {
    const lines = [];
    const hasNoReply = this.state.reasons.includes("재답변 부재");
    const hasSlowReply = this.state.reasons.includes("정확히 답변 안 함");

    if (hasNoReply && hasSlowReply) {
      lines.push(
        "마스터님께서 학생들의 재질문에 답장을 해 주지 않거나, 질문을 선점한 후 오랜 시간 답장을 하지 않을 경우, 학생들은 궁금증을 해소할 길이 없습니다. 큐브는 실시간 질문답변 앱으로, 반드시 답변이 가능한 상황에서 질문 열람 및 성실한 답변을 제공해 주세요.\n\n또한, 답변활동 시 최초의 질문에만 답해주는 것이 아닌 학생의 궁금증이 모두 해결될 때까지 푸시 알림을 좀 더 신경쓰셔서 답변이 누락되는 일이 없도록 주의해 주세요."
      );
    } else if (hasNoReply) {
      lines.push(reasonExplanations["재답변 부재"]);
    } else if (hasSlowReply) {
      lines.push(reasonExplanations["정확히 답변 안 함"]);
    }

    if (this.state.reasons.includes("불친절한 답변")) {
      lines.push(reasonExplanations["불친절한 답변"]);
    }
    if (this.state.reasons.includes("해설지/캡처본 답변")) {
      lines.push(reasonExplanations["해설지/캡처본 답변"]);
    }

    if (this.state.customReasonLabel && this.state.customReasonExplanation) {
      lines.push(this.mark(this.state.customReasonExplanation));
    }

    return lines;
  }

  // 조치 단계는 더 이상 직접 선택하지 않고, 다른 입력값으로부터 자동으로 정해진다.
  // - 정지 기간을 "영구정지"로 선택한 경우 → 영구정지 문구
  // - "특수 상황"에 기존 경고 이력 있음이 체크된 경우 → 재경고 문구
  // - 그 외에는 첫 경고 문구
  getStage(config) {
    let stage = "first";

    if (this.state.includeSuspend && this.state.suspendDuration === "permanent") {
      stage = "permanent";
    } else if (this.state.specialFlags.includes("priorWarning")) {
      stage = "repeat";
    }

    return config.stages.includes(stage) ? stage : config.stages[0];
  }

  // 정지 문단이 "영구정지"로 붙는 경우, 기본 문구 안에 있는 영구정지 언급과
  // 중복되므로 그 부분은 생략해야 한다.
  willDuplicatePermanentSuspend() {
    return this.state.includeSuspend && this.state.suspendDuration === "permanent";
  }

  getBaseText(violationType, target, stage) {
    if (violationType === "chitchat") {
      return this.getChitchatTemplate(target, stage);
    } else if (violationType === "qSharing") {
      return this.getQSharingTemplate(target, stage);
    } else if (violationType === "poorAnswer") {
      return this.getPoorAnswerTemplate(target);
    } else if (violationType === "hashtag") {
      return this.getHashtagTemplate(target);
    }

    return null;
  }

  getChitchatTemplate(target, stage) {
    let base;
    let closing;

    if (stage === "first") {
      if (target === "master") {
        base = this.templates.chitchat.masterFirst;
        closing =
          "금일 경고 이후에도 유사한 부정활동이 발견될 시 활동 정지 등 큐브 계정에 불이익이 있을 수 있으니 이점 유의하시어 활동해 주시기 바랍니다.\n\n부정활동 관련 자세한 내용은 앱 내 공지사항 및 이용 가이드 등을 통해 확인하실 수 있습니다.";
      } else {
        base = this.templates.chitchat.studentFirst;
        closing =
          "금일 경고 이후에도 유사한 부정활동이 발견될 시 활동 정지 등 큐브 계정에 불이익이 있을 수 있으니 유의하시어 활동해 주시기 바랍니다.\n\n부정활동 관련 자세한 내용은 앱 내 공지사항 및 이용 가이드 등을 통해 확인하실 수 있습니다.";
      }
    } else if (stage === "repeat") {
      if (target === "master") {
        base = this.templates.chitchat.masterRepeat;
        closing =
          "금일 경고 이후에도 유사한 부정활동이 발견될 시 활동 정지 등 큐브 계정에 불이익이 있을 수 있으니 이점 유의하시어 활동해 주시기 바랍니다.\n\n부정활동 관련 자세한 내용은 앱 내 공지사항 및 이용 가이드 등을 통해 확인하실 수 있습니다.";
      } else {
        base = this.templates.chitchat.studentRepeat;
        closing =
          "금일 경고 이후 유사한 부정활동 발견 시, 활동 정지 등 큐브 활동에 불이익이 있을 수 있으니 이점 유의하시어 서비스 이용해 주세요.\n\n부정활동 관련 자세한 내용은 앱 내 공지사항 및 이용 가이드 등을 통해 확인하실 수 있습니다.";
      }
    } else if (stage === "permanent") {
      return target === "master"
        ? this.templates.chitchat.masterPermanent
        : this.templates.chitchat.studentPermanent;
    } else {
      return null;
    }

    // 정지/입금 문단이 붙으면 실제 조치 내용이 구체적으로 안내되므로,
    // "향후 불이익이 있을 수 있다"는 일반 경고 문구는 중복이라 생략한다.
    if (!this.state.includePayment && !this.state.includeSuspend) {
      return `${base}\n\n${closing}`;
    }
    return base;
  }

  getQSharingTemplate(target, stage) {
    if (stage !== "permanent") return null;

    // qSharing은 정지 토글 여부와 무관하게 항상 "permanent" 문구를 쓰므로,
    // 정지 문단이 실제로 영구정지를 안내할 때만 자체 영구정지 문장을 생략한다.
    const skipPermanentMention = this.willDuplicatePermanentSuspend();

    if (target === "master") {
      const suspendNote = skipPermanentMention
        ? ""
        : "부정활동으로 인해 {masterName}님의 큐브 마스터 계정은 영구 정지 처리될 예정입니다.";
      return this.templates.qSharing.master.replace("{qSharingSuspendNote}", suspendNote);
    }

    const suspendNote = skipPermanentMention
      ? ""
      : "부정활동으로 인해 회원님의 큐브 계정은 금일부터 영구 정지 조치될 예정입니다.";
    return this.templates.qSharing.student.replace("{qSharingSuspendNote}", suspendNote);
  }

  getPoorAnswerTemplate(target) {
    if (target !== "master") return null;

    if (this.state.introChoice === "custom") {
      return this.state.introCustomText ? this.escapeHtml(this.state.introCustomText) : "";
    }

    return introPresets.poorAnswer[this.state.introChoice] || introPresets.poorAnswer.p1;
  }

  // 정지/입금 문단이 포함되면 삭제 처리·포인트 회수·향후 경고 문구가
  // 각 문단에서 더 구체적으로 다뤄지므로, 기본 문구에서는 중복을 피하기 위해 생략한다.
  buildPoorAnswerClosing() {
    const lines = [];

    if (!this.state.includePayment) {
      lines.push("해당 부정 답변은 모두 삭제 처리되었으며, 부정 획득한 포인트 총 {recoveredPoints}A도 회수되었습니다.");
    }

    if (!this.state.includePayment && !this.state.includeSuspend) {
      lines.push(
        "이후에도 신고 승인 건수가 누적되거나, 그 외 유사한 부정 활동이 발견될 경우, 큐브 활동에 불이익이 있을 수 있으니 이점 유의하시어 답변 활동해 주시기 바랍니다."
      );
    }

    return lines.join("\n\n");
  }

  getHashtagTemplate(target) {
    return target === "master"
      ? this.templates.hashtag.master
      : this.templates.hashtag.student;
  }

  getSuspendClause() {
    const startPhrase =
      this.state.suspendStartMode === "afterPayment"
        ? "입금 완료 확인 이후"
        : "{suspendStartDate}부터";

    const priorWarningPrefix = this.state.specialFlags.includes("priorWarning")
      ? "기존 경고 및 정지 이력에 더해, "
      : "";

    let clause = `${priorWarningPrefix}회원님의 계정은 ${startPhrase} {suspendDays}일간 정지 처리될 예정입니다. 현시점부터 진행되는 질문/답변에 대해서는 포인트가 지급되지 않습니다.`;

    // 영구정지는 "해제" 자체가 없으므로 재발 시 경고 문구를 붙이지 않는다.
    if (this.state.suspendDuration !== "permanent") {
      if (this.state.includePayment) {
        clause += " 아울러 기간 내 안내드린 비용을 미입금하거나, 활동 정지 해제 이후 한 번 더 유사 부정활동이 발견될 시 활동 영구 정지 처리가 될 예정이니 이점 참고해 주시기 바랍니다.";
      } else {
        clause += " 활동 정지 해제 이후에도 유사한 부정활동이 발견될 경우, 활동 영구 정지 처리가 될 수 있으니 이점 유의하시어 활동해 주시기 바랍니다.";
      }
    }

    return clause;
  }

  getPaymentClause() {
    if (this.state.financeType === "refund") {
      return `금일 중으로 잔여 포인트를 모두 환급 신청해 주시기 바라며, 환급 정보를 메일로 전달해주시기 바랍니다.

- 메일: qube_official@megastudy.net
- 환급정보: 이름, 아이디, 주민등록번호, 은행명, 계좌번호`;
    }

    let clause = `해당 부정 활동 내역은 모두 삭제 처리되었으며, 이를 통해 부정 획득한 포인트는 총 {illegalPoints}A로 확인되었습니다. 보유하신 포인트에서 {deductedAmount}A가 차감되었고, 남은 {undeductedAmount}원 중 소득세/주민세를 제외한 {depositAmount}원에 대해 {paymentDueDate}까지 입금 요청을 드립니다.`;

    if (this.state.cancelledRefundDate && this.state.cancelledRefundAmount) {
      clause += ` 보유 포인트가 부족하여 {cancelledRefundDate} 환급 신청하신 {cancelledRefundAmount} 건 취소 처리 후 포인트가 회수되었으니 이점 참고 바랍니다.`;
    }

    clause += `

[계좌정보] 기업은행/667-028940-04-015/메가스터디교육(주)
[입금액] {depositAmount}원
[입금기한] {paymentDueDate}`;

    return clause;
  }

  // 사용자가 직접 입력/선택한 값만 <mark>로 감싸 미리보기에서 눈에 띄게 하고,
  // 복사 시에는 textContent가 태그를 무시하므로 원본 텍스트만 복사된다.
  escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  mark(value) {
    return `<mark class="user-input">${this.escapeHtml(value)}</mark>`;
  }

  // 학생명은 개인정보 보호를 위해 가운데 한 글자를 *로 가린다. 마스터명은 그대로 노출한다.
  maskMiddleChar(name) {
    if (!name) return name;
    const chars = Array.from(name);
    if (chars.length <= 1) return name;

    const midIndex = chars.length === 2 ? 1 : Math.floor(chars.length / 2);
    chars[midIndex] = "*";
    return chars.join("");
  }

  replaceVariables(text) {
    let result = text;

    result = result.replace(/\{masterName\}/g, this.mark(this.state.masterName || "마스터님"));
    result = result.replace(/\{studentName\}/g, this.mark(this.maskMiddleChar(this.state.studentName) || "학생"));
    result = result.replace(/\{count\}/g, this.mark(this.state.violationCount || "O"));
    result = result.replace(/\{recoveredPoints\}/g, this.mark(this.state.recoveredPoints || "O"));
    result = result.replace(/\{illegalPoints\}/g, this.mark(this.state.illegalPoints || "O"));
    result = result.replace(/\{deductedAmount\}/g, this.mark(this.state.deductedAmount || "O"));
    result = result.replace(/\{undeductedAmount\}/g, this.mark(this.state.undeductedAmount || "O"));
    result = result.replace(/\{depositAmount\}/g, this.mark(this.state.depositAmount || "O"));
    result = result.replace(/\{paymentDueDate\}/g, this.mark(this.state.paymentDueDate || "O/O"));
    result = result.replace(/\{cancelledRefundDate\}/g, this.mark(this.state.cancelledRefundDate || "O/O"));
    result = result.replace(/\{cancelledRefundAmount\}/g, this.mark(this.state.cancelledRefundAmount || "O"));
    result = result.replace(/\{suspendStartDate\}/g, this.mark(this.state.suspendStartDate || "O/O"));

    if (this.state.suspendDuration === "permanent") {
      result = result.replace(/\{suspendDays\}일간/g, this.mark("영구"));
      result = result.replace(/\{suspendDays\}일/g, this.mark("영구"));
      result = result.replace(/\{suspendDays\}/g, this.mark("영구"));
    } else {
      const suspendDaysText =
        this.state.suspendDuration === "custom"
          ? this.state.suspendDurationCustom || "O"
          : this.state.suspendDuration || "O";
      result = result.replace(/\{suspendDays\}/g, this.mark(suspendDaysText));
    }

    // 문단이 비어 생기는 빈 줄(연속 개행)을 정리한다.
    result = result.replace(/\n{3,}/g, "\n\n");

    return result;
  }

  // ===== 템플릿 모음 =====

  templates = {
    chitchat: {
      masterFirst: `안녕하세요, 큐브입니다.

큐브 질문 답변 모니터링 과정에서 비정상적인 답변 활동이 감지되어 안내드립니다.

회원님은 {studentName} 학생과 총 {count}건의 1:1 질문을 주고 받으셨으며, 검토 결과 모든 건(or 일부/다수)이 정상적인 질문/답변이 아닌 것으로 확인되었습니다.

이에 따라 해당 질문들은 모두 삭제 처리되었으며, 마스터님이 부정 획득한 포인트도 회수되었습니다.

학습과 무관한 질문답변을 진행하거나, 친구/가족/지인과 소통을 목적으로 큐브를 부적절하게 이용하는 경우 등은 모두 부정활동에 해당됩니다.`,

      studentFirst: `안녕하세요, 큐브입니다.

큐브 질문 답변 모니터링 과정에서 비정상적인 답변 활동이 감지되어 안내드립니다.

회원님은 {masterName} 마스터와 총 {count}건의 1:1 질문을 주고 받으셨으며, 검토 결과 모든 건(or 일부/다수)이 정상적인 질문/답변이 아닌 것으로 확인되었습니다.

이에 따라 해당 질문들은 삭제되었으며, 마스터가 부정 획득한 포인트도 회수되었습니다.

학습과 무관한 질문답변을 진행하거나, 친구/가족/지인과 소통을 목적으로 큐브를 부적절하게 이용하는 경우 등은 모두 부정활동에 해당됩니다.`,

      masterRepeat: `안녕하세요, 큐브입니다.

큐브 질문 답변 모니터링 과정에서 비정상적인 답변 활동이 감지되어 안내드립니다.

한 차례의 경고 조치에도 불구하고, 회원님은 {studentName} 학생과 총 {count}건의 1:1 질문을 주고 받으셨으며, 검토 결과 모든 건(or 다수)이 정상적인 질문/답변이 아닌 것으로 확인되었습니다.

이에 따라 해당 질문들은 모두 삭제 처리되었으며, 마스터님이 부정 획득하신 포인트도 모두 회수되었습니다.

학습과 무관한 질문답변을 진행하거나, 친구/가족/지인과 소통을 목적으로 큐브를 부적절하게 이용하는 경우 등은 모두 부정활동에 해당됩니다.`,

      studentRepeat: `안녕하세요, 큐브입니다.

큐브 질문 답변 모니터링 과정에서 비정상적인 질문 활동이 감지되어 안내드립니다.

한 차례의 경고 조치에도 불구하고, 회원님은 {masterName} 마스터와 총 {count}건의 1:1 질문을 주고 받으셨으며, 검토 결과 모든 건(or 다수)이 정상적인 질문/답변이 아닌 것으로 확인되었습니다.

이에 따라 해당 질문은 모두 삭제되었으며, 마스터가 부정 획득한 포인트도 회수되었습니다.

질문/답변 도중 학습과 무관한 사담을 진행하거나, 소통을 목적으로 큐브를 부적절하게 이용하는 경우 등은 모두 부정활동에 해당됩니다.

해당 마스터와는 더 이상 질문/답변을 주고 받으실 수 없습니다.`,

      masterPermanent: `안녕하세요, 큐브입니다.

큐브 모니터링 중 회원님의 질문답변 내역에서 비정상적인 활동이 감지되었습니다.

회원님은 {studentName} 학생과 총 {count}건의 1:1 질문을 주고 받았으며, 검토 결과 모든 건이 정상적인 질문/답변이 아닌 것으로 확인되었습니다.

해당 질문들은 모두 삭제 처리되었으며, 마스터님이 부정 획득하신 포인트도 모두 회수되었습니다.

가족/지인/친구와 의도적으로 Q를 나눔해서 환급을 받으시는 경우, 형법 제314조 업무방해죄, 제347조 사기죄 등에 해당되며, 민법 제 750조에 의거하여 손해 배상 청구가 가능한 엄중한 사안입니다.

위 내용은 회원 정보 대조 및 법률적 검토를 마친 사항입니다.`,

      studentPermanent: `안녕하세요. 큐브입니다.

큐브 모니터링 중 회원님의 질문답변 내역에서 비정상적인 활동이 감지되어 확인 후 안내드립니다.

회원님은 {masterName} 마스터와 총 {count}건의 1:1 질문을 주고 받았으며, 검토 결과 모든 건이 정상적인 질문/답변이 아닌 것으로 확인되었습니다.

이에 따라 해당 질문들은 모두 삭제 처리되었습니다.

가족/지인/친구와 의도적으로 Q를 나눔해서 마스터가 환급을 받는 경우, 형법 제314조 업무방해죄, 제347조 사기죄 등에 해당되며, 민법 제 750조에 의거하여 손해 배상 청구가 가능한 엄중한 사안입니다. 이점 참고해 주세요.`,
    },

    qSharing: {
      master: `안녕하세요. 메가스터디 큐브입니다.

큐브 모니터링 중 {masterName} 마스터님의 질문답변 내역에서 비정상적인 활동이 감지되어 확인 후 안내드립니다.

{masterName}님은 {studentName} 학생과 총 {count}건의 1:1 질문을 주고 받으셨으며, 질문 등록 시간 및 패턴, 질문/답변 내용, 질문 과목, 답변 소요 시간 등을 복합적으로 검토한 결과 총 {count}건이 정상적인 질문/답변이 아닌 것으로 확인되었습니다. 이에 따라 해당 질문들은 모두 삭제 처리되었습니다.

의도적으로 Q를 나눔하는 행위는 금전 취득으로 분류되며, 금전 취득을 위한 불법적인 활동이 발생할 경우 이용약관 7조, 12조, 16조에 의거 법적 조치가 취해질 수 있습니다. 가족/지인/친구와 의도적으로 Q를 나눔해서 환급을 받으시는 경우, 형법 제314조 업무방해죄, 제347조 사기죄 등에 해당되며, 민법 제750조에 의거하여 손해 배상 청구가 가능한 엄중한 사안입니다.

메가스터디 큐브에서는 좋은 취지로 학생들의 학습에 도움을 주기 위해 질문권을 무상으로 지급해드리고 있습니다. 해당 질문권을 사용한 부정적인 활동에 대해서는 엄격하게 관리하고 있는 점 참고해 주시기 바랍니다.

{qSharingSuspendNote}

지금 시점부터 {studentName} 학생과 주고 받는 질문은 모두 부정활동으로 간주되어 포인트가 지급되지 않습니다.`,

      student: `안녕하세요. 큐브입니다.

큐브 모니터링 중 회원님의 질문답변 내역에서 비정상적인 활동이 감지되어 확인 후 안내드립니다.

회원님은 {masterName} 마스터와 총 {count}건의 1:1 질문을 주고 받았으며, 검토 결과 모든 건이 정상적인 질문/답변이 아닌 것으로 확인되었습니다.

이에 따라 해당 질문들은 모두 삭제 처리되었습니다.

{qSharingSuspendNote}

가족/지인/친구와 의도적으로 Q를 나눔해서 마스터가 환급을 받는 경우, 형법 제314조 업무방해죄, 제347조 사기죄 등에 해당되며, 민법 제 750조에 의거하여 손해 배상 청구가 가능한 엄중한 사안입니다. 이점 참고해 주세요.`,
    },

    hashtag: {
      master: `안녕하세요. 큐브입니다.

큐브 질문/답변 모니터링 중 마스터님께서 해시태그에 부적절한 내용을 작성하신 것이 확인되어 안내드립니다.

해당 해시태그는 학생들에게 불쾌감을 줄 수 있으니 이후에는 절대 삼가주시기 바라며, 해시태그에는 학습과 관련된 내용을 입력해 주세요.

현재 해당되는 질문은 모두 삭제되었으며, 이후에도 이와 같은 부적절한 언행이 발견될 시, 활동 정지 등 큐브 활동에 불이익이 있을 수 있으니 이점 유의하시어 활동해 주시기 바랍니다.

또한, 답변해주신 내용에 대해 부당하게 낮은 별점을 받았다고 생각되실 경우 태그에 남기는 것이 아닌 [관리자에게 문의하기]로 문의해주시면 확인 도와드리겠습니다.`,

      student: `안녕하세요. 큐브입니다.

큐브 질문/답변 모니터링 중 회원님께서 해시태그에 부적절한 내용을 작성하신 것이 확인되어 안내드립니다.

해당 해시태그는 마스터에게 불쾌감을 줄 수 있으니 이후에는 절대 삼가주시기 바라며, 해시태그에는 학습과 관련된 내용을 입력해 주세요.

현재 해당되는 질문은 모두 삭제되었으며, 이후에도 이와 같은 부적절한 언행이 발견될 시, 활동 정지 등 큐브 활동에 불이익이 있을 수 있으니 이점 유의하시어 활동해 주시기 바랍니다.

마스터의 답변에 문제가 있을 경우에는 직접 대응하지 마시고 [신고하기]나 [관리자에게 문의하기]로 즉시 신고를 접수해 주세요. 확인 후 조치를 도와드리겠습니다.`,
    },
  };
}

// ===== UI 제어 =====

const app = new WarningGenerator();

const violationTypeGroup = document.getElementById("violationTypeGroup");
const targetGroup = document.getElementById("targetGroup");
const previewContent = document.getElementById("previewContent");
const copyBtn = document.getElementById("copyBtn");
const generateBtn = document.getElementById("generateBtn");
const resetBtn = document.getElementById("resetBtn");
const statusMsg = document.getElementById("statusMsg");

violationTypeGroup.addEventListener("change", (e) => {
  const violationType = e.target.value;
  app.state.violationType = violationType;

  const config = violationConfig[violationType];
  if (config.targets.length > 1) {
    targetGroup.style.display = "flex";
    app.state.target = "master";
    document.getElementById("targetMaster").checked = true;
  } else {
    targetGroup.style.display = "none";
    app.state.target = config.targets[0];
  }

  updateConditionalFields(violationType, config);
});

document.querySelectorAll('input[name="target"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    app.state.target = e.target.value;
  });
});

document.getElementById("masterName").addEventListener("input", (e) => {
  app.state.masterName = e.target.value;
});

document.getElementById("studentName").addEventListener("input", (e) => {
  app.state.studentName = e.target.value;
});

document.getElementById("violationCount").addEventListener("input", (e) => {
  app.state.violationCount = e.target.value;
});

document.getElementById("recoveredPoints").addEventListener("input", (e) => {
  app.state.recoveredPoints = e.target.value;
});

const introCustomField = document.getElementById("introCustomField");

document.querySelectorAll('input[name="introChoice"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    app.state.introChoice = e.target.value;
    introCustomField.classList.toggle("show", e.target.value === "custom");
  });
});

document.getElementById("introCustomText").addEventListener("input", (e) => {
  app.state.introCustomText = e.target.value;
});

document.getElementById("customReasonLabel").addEventListener("input", (e) => {
  app.state.customReasonLabel = e.target.value;
});

document.getElementById("customReasonExplanation").addEventListener("input", (e) => {
  app.state.customReasonExplanation = e.target.value;
});

const suspendSection = document.getElementById("suspendSection");

document.getElementById("includeSuspend").addEventListener("change", (e) => {
  app.state.includeSuspend = e.target.checked;
  suspendSection.classList.toggle("show", e.target.checked);
});

const suspendStartDateField = document.getElementById("suspendStartDateField");

document.querySelectorAll('input[name="suspendStartMode"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    app.state.suspendStartMode = e.target.value;
    suspendStartDateField.classList.toggle("show", e.target.value === "date");
  });
});

document.getElementById("suspendStartDate").addEventListener("input", (e) => {
  app.state.suspendStartDate = e.target.value;
});

const suspendDurationCustomField = document.getElementById("suspendDurationCustomField");

document.getElementById("suspendDuration").addEventListener("change", (e) => {
  app.state.suspendDuration = e.target.value;
  suspendDurationCustomField.classList.toggle("show", e.target.value === "custom");
});

document.getElementById("suspendDurationCustom").addEventListener("input", (e) => {
  app.state.suspendDurationCustom = e.target.value;
});

const paymentSection = document.getElementById("paymentSection");
const paymentBreakdownFields = document.getElementById("paymentBreakdownFields");

document.getElementById("includePayment").addEventListener("change", (e) => {
  app.state.includePayment = e.target.checked;
  paymentSection.classList.toggle("show", e.target.checked);
  if (e.target.checked) {
    paymentBreakdownFields.classList.toggle("show", app.state.financeType === "payment");
  }
});

document.querySelectorAll('input[name="financeType"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    app.state.financeType = e.target.value;
    paymentBreakdownFields.classList.toggle("show", e.target.value === "payment");
  });
});

document.getElementById("illegalPoints").addEventListener("input", (e) => {
  app.state.illegalPoints = e.target.value;
});

document.getElementById("deductedAmount").addEventListener("input", (e) => {
  app.state.deductedAmount = e.target.value;
});

document.getElementById("undeductedAmount").addEventListener("input", (e) => {
  app.state.undeductedAmount = e.target.value;
});

document.getElementById("depositAmount").addEventListener("input", (e) => {
  app.state.depositAmount = e.target.value;
});

document.getElementById("cancelledRefundDate").addEventListener("input", (e) => {
  app.state.cancelledRefundDate = e.target.value;
});

document.getElementById("cancelledRefundAmount").addEventListener("input", (e) => {
  app.state.cancelledRefundAmount = e.target.value;
});

document.getElementById("paymentDueDate").addEventListener("input", (e) => {
  app.state.paymentDueDate = e.target.value;
});

document.querySelectorAll('input[name="reasons"]').forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    app.state.reasons = Array.from(
      document.querySelectorAll('input[name="reasons"]:checked')
    ).map((cb) => cb.value);
  });
});

document.querySelectorAll('input[name="specialFlags"]').forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    app.state.specialFlags = Array.from(
      document.querySelectorAll('input[name="specialFlags"]:checked')
    ).map((cb) => cb.value);
  });
});

generateBtn.addEventListener("click", () => {
  const result = app.generateTemplate();

  if (!result) {
    showStatus("위반 유형과 대상을 선택해주세요.", "error");
    return;
  }

  previewContent.innerHTML = result;
  previewContent.classList.remove("empty");
  showStatus("쪽지가 생성되었습니다.", "success");
});

resetBtn.addEventListener("click", () => {
  document.querySelectorAll('input[type="text"], input[type="number"], input[type="date"], select').forEach(
    (input) => {
      input.value = "";
    }
  );

  document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(
    (input) => {
      input.checked = false;
    }
  );

  document.getElementById("suspendModeDate").checked = true;
  document.getElementById("finPayment").checked = true;
  document.getElementById("intro_p1").checked = true;

  app.state = {
    violationType: null,
    target: "master",
    masterName: "",
    studentName: "",
    violationCount: "",
    recoveredPoints: "",
    includeSuspend: false,
    suspendStartMode: "date",
    suspendStartDate: "",
    suspendDuration: "",
    suspendDurationCustom: "",
    includePayment: false,
    financeType: "payment",
    illegalPoints: "",
    deductedAmount: "",
    undeductedAmount: "",
    depositAmount: "",
    paymentDueDate: "",
    cancelledRefundDate: "",
    cancelledRefundAmount: "",
    introChoice: "p1",
    introCustomText: "",
    reasons: [],
    customReasonLabel: "",
    customReasonExplanation: "",
    specialFlags: [],
  };

  previewContent.textContent = "위반 유형과 대상을 선택하고 생성 버튼을 누르세요.";
  previewContent.classList.add("empty");
  targetGroup.style.display = "none";

  hideAllConditionalFields();
  suspendStartDateField.classList.add("show");
  document.getElementById("reasonFields").classList.add("show");
});

copyBtn.addEventListener("click", () => {
  const text = previewContent.textContent;

  if (text.includes("위반 유형")) {
    showStatus("먼저 쪽지를 생성해주세요.", "error");
    return;
  }

  const showCopied = () => {
    copyBtn.textContent = "복사됨!";
    copyBtn.classList.add("copied");

    setTimeout(() => {
      copyBtn.textContent = "복사";
      copyBtn.classList.remove("copied");
    }, 2000);
  };

  // file://로 열었을 때 등 navigator.clipboard를 쓸 수 없는 환경을 위한 대체 복사 방식.
  const fallbackCopy = () => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    let succeeded = false;
    try {
      succeeded = document.execCommand("copy");
    } catch (err) {
      succeeded = false;
    }

    document.body.removeChild(textarea);

    if (succeeded) {
      showCopied();
    } else {
      showStatus("복사에 실패했습니다. 미리보기 내용을 직접 선택해 복사해주세요.", "error");
    }
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(showCopied).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
});

function updateConditionalFields(violationType, config) {
  const nameFields = document.getElementById("nameFields");
  const countFields = document.getElementById("countFields");
  const introSection = document.getElementById("introSection");
  const specialFields = document.getElementById("specialFields");

  nameFields.classList.remove("show");
  introSection.classList.remove("show");

  if (violationType === "chitchat" || violationType === "qSharing") {
    nameFields.classList.add("show");
  }

  if (violationType === "poorAnswer") {
    introSection.classList.add("show");
  }

  countFields.classList.add("show");
  specialFields.classList.add("show");
}

function hideAllConditionalFields() {
  document
    .querySelectorAll(".conditional-fields")
    .forEach((field) => field.classList.remove("show"));
}

function showStatus(message, type) {
  statusMsg.textContent = message;
  statusMsg.className = `status-msg ${type}`;

  if (type === "success") {
    setTimeout(() => {
      statusMsg.className = "status-msg";
    }, 3000);
  }
}
