/**
 * 引导式教学骨架冒烟测试：
 * 校验五步闭环 / 答题六步 SOP / 错因分类矩阵的结构完整性，
 * 确认骨架确实注入了系统提示词，并且骨架里不含任何题目答案。
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const scaffold = require(path.join(ROOT, 'backend/src/agent/scaffold'));
const prompts = require(path.join(ROOT, 'backend/src/agent/prompts'));
const { lessons } = require(path.join(ROOT, 'backend/src/models/lessons'));

let pass = 0; const fails = [];
function check(label, ok, detail) {
  if (ok) pass += 1; else fails.push(label + (detail ? ' :: ' + detail : ''));
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  ' + detail : ''));
}

// ---------- 1. 五步教学闭环 ----------
const LOOP = ['anchor', 'explore', 'formalize', 'practice', 'diagnose'];
check('五步闭环顺序正确', scaffold.STAGES.map(s => s.key).join(',') === LOOP.join(','),
  scaffold.STAGES.map(s => s.key).join(','));
check('每个阶段都有目标 / 图模板 / 脚本 / 降级选项',
  scaffold.STAGES.every(s => s.goal && s.figure && s.scripts.length >= 2 && s.fallback.length >= 2), '');
check('每个阶段都声明了大模型临场边界', scaffold.STAGES.every(s => !!s.llmTask), '');

// ---------- 2. 答题 SOP 六步 ----------
check('答题 SOP 为六步', scaffold.ANSWER_SOP.length === 6, 'steps=' + scaffold.ANSWER_SOP.length);
check('SOP 覆盖 读题 / 策略 / 作答 / 分档 / 纠正 / 变式',
  ['read', 'strategy', 'attempt', 'classify', 'correct', 'transfer']
    .every(k => scaffold.ANSWER_SOP.some(item => item.key === k)), '');

// ---------- 3. 错因分类矩阵 ----------
check('错因矩阵 6 大类', scaffold.ERROR_MATRIX.length === 6, 'n=' + scaffold.ERROR_MATRIX.length);
check('错因矩阵每类都有典型表现与应对策略',
  scaffold.ERROR_MATRIX.every(item => item.label && item.symptoms.length && item.strategy && item.probe.length), '');
check('历史错因名称能映射回矩阵',
  scaffold.normalizeErrorType('符号混淆') === 'symbol' && scaffold.normalizeErrorType('计算失误') === 'compute'
  && scaffold.normalizeErrorType('无法识别') === 'blank' && scaffold.normalizeErrorType('概念不清') === 'concept', '');
check('空白 / 情绪也各有归属',
  scaffold.normalizeErrorType('条件识别') === 'concept' && scaffold.normalizeErrorType('不会迁移') === 'strategy', '');
check('规则能识别「用哪种方法」属于策略错', scaffold.classifyError('这道题我用哪种方法呢') === 'strategy', '');

// ---------- 4. 短评与降级追问都守红线 ----------
const comment = scaffold.shortComment('符号混淆', '代入求根公式');
check('一句话短评指出步骤与错因类型', comment.indexOf('代入求根公式') !== -1 && comment.indexOf('符号') !== -1, comment);
check('短评只指错因、不给正解', !/等于|=|答案是/.test(comment), comment);
check('每类错因都有降级追问', scaffold.ERROR_MATRIX.every(item => !!scaffold.probeFor(item.key)), '');
check('每类错因都有降级选项', scaffold.ERROR_MATRIX.every(item => scaffold.fallbackFor(item.key).length >= 2), '');
check('提示上限为 3 次', scaffold.MAX_HINTS === 3, 'max=' + scaffold.MAX_HINTS);
check('超限话术标注需要老师介入', /老师介入/.test(scaffold.hintLimitReply('因式分解')), '');

// ---------- 5. 讲题步骤 → 教学阶段 ----------
const kp3 = lessons.kp3;
const mapped = kp3.steps.map((step, i) => scaffold.resolveStage(step.name, i, kp3.steps.length));
check('情境导入落在阶段一', mapped[0] === 'anchor', mapped[0]);
check('观察猜想落在阶段二', mapped[1] === 'explore', mapped[1]);
check('定理表述落在阶段三', mapped[2] === 'formalize', mapped[2]);
check('应用与逆定理落在阶段四', mapped[4] === 'practice', mapped[4]);
check('按序号也能兜底映射', scaffold.stageForStepIndex(0, 5) === 'anchor' && scaffold.stageForStepIndex(4, 5) === 'diagnose', '');

// ---------- 6. 骨架进系统提示词 ----------
const lesson = lessons.kp3;
const context = { lesson: lesson, stepIndex: 2, persona: 'tutor', profile: { hintCount: 1 } };
const block = prompts.buildContextBlock(context);
check('系统提示词包含教学阶段', block.indexOf('引导式教学骨架') !== -1 && block.indexOf('阶段3') !== -1, '');
check('系统提示词列出六类错因',
  ['概念不清', '策略 / 逻辑错', '符号 / 公式错', '纯计算错', '空白 / 看不清', '情绪 / 跑题']
    .every(name => block.indexOf(name) !== -1), '');
check('系统提示词写明提示上限红线', block.indexOf('提示上限 3 次') !== -1, '');
const system = prompts.buildSystemPrompt(context);
check('完整系统提示词含角色与骨架',
  system.indexOf('讲题老师') !== -1 && system.indexOf('错因分类矩阵') !== -1, 'len=' + system.length);

// ---------- 7. 骨架不泄露任何题目答案 ----------
const secrets = [];
Object.keys(lessons).forEach(id => {
  lessons[id].steps.forEach(step => {
    const cp = step.checkpoint;
    if (cp && Array.isArray(cp.options) && typeof cp.correct === 'number') {
      const text = String(cp.options[cp.correct] || '').trim();
      if (text.length >= 4) secrets.push(text);
    }
  });
});
const haystack = JSON.stringify(scaffold.describe()) + '\n' + scaffold.STAGES.map(s => scaffold.promptBlock(s.key)).join('\n');
const leaked = secrets.filter(text => haystack.indexOf(text) !== -1);
check('骨架里不含任何正确选项原文', leaked.length === 0, leaked.join(' / '));

// ---------- 8. 对外说明可用于前端展示 ----------
const info = scaffold.describe();
check('describe 输出闭环 / SOP / 矩阵',
  info.loop.length === 5 && info.sop.length === 6 && info.errorMatrix.length === 6
  && !!info.redline && info.maxHints === 3, '');

console.log('');
console.log('RESULT: ' + pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { fails.forEach(f => console.log('  x ' + f)); process.exit(1); }
process.exit(0);