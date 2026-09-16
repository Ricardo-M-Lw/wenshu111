// 参数校验：对应框架「二、分层框架总览」接入层里的「参数校验」
// 用法：router.post('/register', validate({ phone: { required: true, type: 'phone', message: '请输入正确的手机号' } }), handler)

function validate(rules) {
  return function (req, res, next) {
    const body = req.body || {};
    const errors = [];

    Object.keys(rules).forEach(function (field) {
      const rule = rules[field] || {};
      const value = body[field];
      const empty = value === undefined || value === null || String(value).trim() === '';

      if (rule.required && empty) {
        errors.push(rule.message || (field + ' 不能为空'));
        return;
      }
      if (empty) return;

      if (rule.type === 'phone' && !/^1[3-9]\d{9}$/.test(String(value))) {
        errors.push(rule.message || '请输入正确的手机号');
        return;
      }
      if (rule.minLength && String(value).length < rule.minLength) {
        errors.push(rule.message || (field + ' 至少 ' + rule.minLength + ' 位'));
        return;
      }
      if (rule.maxLength && String(value).length > rule.maxLength) {
        errors.push(rule.message || (field + ' 最多 ' + rule.maxLength + ' 字'));
      }
    });

    if (errors.length) return res.status(400).json({ error: errors[0], errors: errors });
    return next();
  };
}

module.exports = { validate };