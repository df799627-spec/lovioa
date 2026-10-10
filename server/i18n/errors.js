export const errors = {
  en: {
    // Auth
    'auth.usernameRequired': 'Username, email and password are required',
    'auth.usernameTooShort': 'Username must be at least 2 characters',
    'auth.emailInvalid': 'Please enter a valid email address',
    'auth.passwordTooShort': 'Password must be at least 6 characters',
    'auth.emailExists': 'Email already registered',
    'auth.usernameTaken': 'Username already taken',
    'auth.credentialsRequired': 'Email and password are required',
    'auth.invalidCredentials': 'Invalid email or password',
    'auth.registrationFailed': 'Registration failed',
    'auth.loginFailed': 'Login failed',
    'auth.userNotFound': 'User not found',
    'auth.emailRequired': 'Email is required',
    'auth.resetRequestFailed': 'Failed to send password reset email',
    'auth.resetTokenAndPasswordRequired': 'Reset token and new password are required',
    'auth.invalidOrExpiredResetToken': 'Reset link is invalid or expired',
    'auth.resetFailed': 'Failed to reset password',
    'auth.googleNotConfigured': 'Google login is not configured',
    'auth.googleIdTokenRequired': 'Google ID token is required',
    'auth.googleTokenInvalid': 'Invalid Google login token',
    'auth.googleEmailNotVerified': 'Google account email is not verified',

    // Prompts
    'prompt.required': 'Prompt text is required (min 10 chars)',
    'prompt.notFound': 'Prompt not found',
    'prompt.deleteSuccess': 'Prompt deleted',

    // Upload
    'upload.noFile': 'No image file provided',
    'upload.typeInvalid': 'Only image files are allowed',

    // Generation
    'gen.promptRequired': 'prompt is required',
    'gen.jobNotFound': 'Job not found',
    'gen.enqueueFailed': 'Failed to enqueue generation job',
    'gen.apiError': 'API error',
    'gen.noImageReturned': 'No image returned by provider',
    'gen.timeout': 'Generation timed out',
    'gen.jobFailed': 'Generation job failed',
    'gen.requeueFailed': 'Failed to requeue job',
    'gen.cancelFailed': 'Failed to cancel job',
    'gen.promptRejectedByPolicy': 'Prompt violates safety policy (NSFW/explicit content is not allowed)',
    'gen.moderationUnavailable': 'Content moderation is temporarily unavailable',

    // History
    'history.fieldsRequired': 'imageUrl and prompt are required',
    'history.notFound': 'History item not found',

    // Admin
    'admin.forbidden': 'Admin access required',
    'admin.fieldRequired': 'Missing required field',
    'admin.cannotDemoteSelf': 'Cannot demote yourself',
    'admin.cannotDeleteSelf': 'Cannot delete your own account',

    // Billing
    'billing.unavailable': 'Billing service is temporarily unavailable',
    'billing.invalidPlan': 'Invalid subscription plan',
    'billing.checkoutFailed': 'Failed to create checkout session',
    'billing.portalFailed': 'Failed to open billing portal',
    'billing.noSubscription': 'No active subscription found',
    'billing.creditsRequired': 'Insufficient credits. Please top up to continue.',
    'billing.invalidAmount': 'Invalid top-up amount',
    'billing.topupFailed': 'Failed to initiate top-up',
    'billing.cancelFailed': 'Failed to cancel subscription',

    // Common
    'common.internalError': 'Internal server error',
    'common.badRequest': 'Bad request',
    'common.notFound': 'Not found',
    'common.conflict': 'Conflict',
    'common.unauthorized': 'Unauthorized',
  },
  zh: {
    // Auth
    'auth.usernameRequired': '请输入用户名、邮箱和密码',
    'auth.usernameTooShort': '用户名至少需要 2 个字符',
    'auth.emailInvalid': '请输入有效的邮箱地址',
    'auth.passwordTooShort': '密码至少需要 6 个字符',
    'auth.emailExists': '该邮箱已被注册',
    'auth.usernameTaken': '用户名已被占用',
    'auth.credentialsRequired': '请输入邮箱和密码',
    'auth.invalidCredentials': '邮箱或密码错误',
    'auth.registrationFailed': '注册失败',
    'auth.loginFailed': '登录失败',
    'auth.userNotFound': '用户不存在',
    'auth.emailRequired': '请输入邮箱',
    'auth.resetRequestFailed': '发送重置邮件失败',
    'auth.resetTokenAndPasswordRequired': '缺少重置令牌或新密码',
    'auth.invalidOrExpiredResetToken': '重置链接无效或已过期',
    'auth.resetFailed': '重置密码失败',
    'auth.googleNotConfigured': 'Google 登录尚未配置',
    'auth.googleIdTokenRequired': '缺少 Google ID Token',
    'auth.googleTokenInvalid': 'Google 登录凭证无效',
    'auth.googleEmailNotVerified': 'Google 账号邮箱未验证',

    // Prompts
    'prompt.required': '提示词不能为空（至少 10 个字符）',
    'prompt.notFound': '未找到该提示词',
    'prompt.deleteSuccess': '提示词已删除',

    // Upload
    'upload.noFile': '请上传图片文件',
    'upload.typeInvalid': '只允许上传图片文件（JPG, PNG, WEBP）',

    // Generation
    'gen.promptRequired': '请填写提示词',
    'gen.jobNotFound': '未找到该生成任务',
    'gen.enqueueFailed': '任务入队失败',
    'gen.apiError': 'API 请求失败',
    'gen.noImageReturned': 'API 未返回图片',
    'gen.timeout': '生成超时',
    'gen.jobFailed': '生成失败',
    'gen.requeueFailed': '任务重新入队失败',
    'gen.cancelFailed': '取消任务失败',
    'gen.promptRejectedByPolicy': '提示词违反安全政策（禁止 NSFW / 成人露骨内容）',
    'gen.moderationUnavailable': '内容审核服务暂时不可用',

    // History
    'history.fieldsRequired': 'imageUrl 和 prompt 是必填项',
    'history.notFound': '未找到该历史记录',

    // Admin
    'admin.forbidden': '需要管理员权限',
    'admin.fieldRequired': '缺少必填字段',
    'admin.cannotDemoteSelf': '无法撤销自己的管理员权限',
    'admin.cannotDeleteSelf': '无法删除自己的账户',

    // Billing
    'billing.unavailable': '支付服务暂时不可用',
    'billing.invalidPlan': '无效的订阅计划',
    'billing.checkoutFailed': '创建结账会话失败',
    'billing.portalFailed': '打开支付门户失败',
    'billing.noSubscription': '未找到有效订阅',
    'billing.creditsRequired': '积分不足，请充值后继续使用。',
    'billing.invalidAmount': '无效的充值金额',
    'billing.topupFailed': '充值失败',
    'billing.cancelFailed': '取消订阅失败',

    // Common
    'common.internalError': '服务器内部错误',
    'common.badRequest': '请求参数错误',
    'common.notFound': '未找到',
    'common.conflict': '资源冲突',
    'common.unauthorized': '未授权',
  },
};
