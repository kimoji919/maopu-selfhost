// A small compatibility client for the EMAS calls used by this Mini Program.
// It keeps pages and the existing cloudApi module unchanged while the backend is
// served by selfhost/api instead of EMAS.
class SelfHostedServerless {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || '').replace(/\/$/, '');
    this.transport = {
      timeoutOption: 10000,
      setTimeout: (timeout) => { this.transport.timeoutOption = timeout; },
    };
    this.db = { collection: (name) => this._collection(name) };
    this.user = { getInfo: () => this._getUserInfo() };
    this.function = { invoke: (name, args) => this._invoke(name, args) };
    this.file = {
      uploadFile: () => Promise.reject(new Error('文件上传将在自托管第三步中配置')),
      deleteFile: () => Promise.reject(new Error('文件删除将在自托管第三步中配置')),
    };
  }

  init() {
    if (!this.baseUrl || this.baseUrl.includes('example.com')) {
      console.warn('未配置 selfhost.config.js 中的 api_base_url');
    }
  }

  async _getUserInfo() {
    const session = await this._ensureSession();
    return { success: true, result: { user: { oAuthUserId: session.openid } } };
  }

  async _ensureSession() {
    let session = wx.getStorageSync('maopu-selfhost-session');
    if (session && session.token && session.expiredAt > Math.floor(Date.now() / 1000) + 60) return session;
    const login = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }));
    if (!login.code) throw new Error('微信登录未返回 code');
    const response = await this._request('/auth/wechat', { code: login.code }, false);
    session = response.result;
    wx.setStorageSync('maopu-selfhost-session', session);
    return session;
  }

  async _request(path, data, authenticated = true) {
    if (!this.baseUrl || this.baseUrl.includes('example.com')) {
      throw new Error('请先在 miniprogram/selfhost.config.js 配置 api_base_url');
    }
    const headers = { 'content-type': 'application/json' };
    if (authenticated) {
      const session = await this._ensureSession();
      headers.Authorization = `Bearer ${session.token}`;
    }
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${this.baseUrl}${path}`,
        method: 'POST',
        data,
        header: headers,
        timeout: this.transport.timeoutOption,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
          else reject(new Error(res.data?.error || `API request failed: ${res.statusCode}`));
        },
        fail: reject,
      });
    });
  }

  async _invoke(name, args = {}) {
    return this._request(`/functions/${encodeURIComponent(name)}`, args);
  }

  _collection(name) {
    const call = (operation, args) => this._request(`/db/${encodeURIComponent(name)}`, { operation, args });
    return {
      find: (...args) => call('find', args),
      findOne: (...args) => call('findOne', args),
      count: (...args) => call('count', args),
      aggregate: (...args) => call('aggregate', args),
      insertOne: (...args) => call('insertOne', args),
      insertMany: (...args) => call('insertMany', args),
      updateOne: (...args) => call('updateOne', args),
      updateMany: (...args) => call('updateMany', args),
      deleteOne: (...args) => call('deleteOne', args),
      deleteMany: (...args) => call('deleteMany', args),
      findOneAndUpdate: (...args) => call('findOneAndUpdate', args),
    };
  }
}

module.exports = { SelfHostedServerless };
