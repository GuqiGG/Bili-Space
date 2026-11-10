// @id          ai-summary
// @name        AI 视频总结
// @version     1.0.0
// @description 用你自己的 AI 服务（OpenAI 兼容接口：OpenAI、DeepSeek、通义千问、Kimi……）总结当前视频，要点可点击跳转
// @grant       native

// 运行在两个地方：顶栏里放按钮和结果面板，视频页里取字幕、调用 AI。
if (api.view === 'header') {
  api.settings.define([
    { key: 'endpoint', type: 'text', label: '接口地址', hint: 'OpenAI 兼容地址，例如 https://api.deepseek.com/v1', default: 'https://api.deepseek.com/v1' },
    { key: 'model', type: 'text', label: '模型', default: 'deepseek-chat' },
    { key: 'apiKey', type: 'text', label: 'API 密钥', hint: '填入后会加密保存并从这里清空', default: '' }
  ]);
  // 密钥不留在明文设置里：一填进来就移到加密存储。
  const keepKey = () => { const key = api.settings.get('apiKey'); if (key) api.native.secret.set('apiKey', key).then(() => api.settings.set('apiKey', '')); };
  keepKey(); api.on('settings', keepKey);

  let panel = null;
  const show = (html) => {
    if (!panel || !panel.element || !panel.element.isConnected) {
      panel = api.ui.panel({ title: 'AI 视频总结', html, width: 400 });
      // 点击时间点：让视频页跳过去。
      panel.element?.addEventListener('click', (e) => { const a = e.target.closest('a[data-t]'); if (a) { e.preventDefault(); api.send('seek', Number(a.dataset.t)); } });
    } else panel.set(html);
  };
  const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  api.ui.button({ text: 'AI 总结', title: '用 AI 总结当前视频', onClick: () => { show('<p>正在读取字幕并请求 AI……</p>'); api.send('summarize', null); } });

  api.on('message', (m) => {
    if (m.name === 'summary-error') show('<p style="color:#f56">' + escape(m.data) + '</p>');
    if (m.name !== 'summary') return;
    const { title, points } = m.data;
    show('<h3 style="margin:0 0 10px">' + escape(title) + '</h3>' + points.map((p) =>
      '<p><a href="#" data-t="' + p.time + '" style="color:var(--accent)">' + escape(p.label) + '</a> ' + escape(p.text) + '</p>').join(''));
  });
} else {
  api.on('message', async (m) => {
    if (m.name === 'seek') { api.player.seek(m.data); return; }
    // 只有正在显示的视频页回应（后台标签页里的视频页不动）。
    if (m.name !== 'summarize' || api.page() !== 'video' || document.visibilityState !== 'visible') return;
    try {
      const info = api.video.info();
      const subs = await api.video.subtitles();
      const lines = (subs[0] && subs[0].lines) || [];
      const transcript = lines.map((l) => '[' + Math.floor(l.from) + 's] ' + l.text).join('\n').slice(0, 24000);
      const key = await api.native.secret.get('apiKey');
      if (!key) throw new Error('请先在 设置 → 扩展插件 → AI 视频总结 里填入 API 密钥');
      const prompt = '下面是 B 站视频《' + info.title + '》' + (transcript ? '的字幕（带秒数）' : '的简介（没有字幕）') + '。请用中文给出 4~8 个要点，' +
        '每行格式：秒数|要点。只输出这些行。\n\n' + (transcript || info.desc || '');
      const endpoint = String(api.settings.get('endpoint')).replace(/\/$/, '');
      const response = await api.native.http(endpoint + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: { model: api.settings.get('model'), messages: [{ role: 'user', content: prompt }] },
        timeout: 120000
      });
      if (response.status !== 200) throw new Error('AI 服务返回 ' + response.status + '：' + response.text.slice(0, 200));
      const answer = JSON.parse(response.text).choices[0].message.content;
      const points = answer.split('\n').map((line) => line.split('|')).filter((p) => p.length >= 2).map(([s, text]) => {
        const time = Math.max(0, parseInt(s, 10) || 0);
        return { time, label: Math.floor(time / 60) + ':' + String(time % 60).padStart(2, '0'), text: text.trim() };
      });
      api.send('summary', { title: info.title, points });
    } catch (error) {
      api.send('summary-error', error.message);
    }
  });
}
