// F-04 根修:真实网页抓取(服务端,无 CORS 限制)。
// 之前前端用关键词模板"假装抓取",现在真抓真解析,失败如实报错。
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { url } = req.body || {};
  if (!url || typeof url !== 'string') return res.status(400).json({ error: '缺少 url' });
  let parsed: URL;
  try {
    parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('bad protocol');
  } catch {
    return res.status(422).json({ error: 'URL 格式无效,请检查后重试' });
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const resp = await fetch(parsed.toString(), {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (SeeedGenesis reference-fetcher)' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!resp.ok) return res.status(502).json({ error: `目标站点返回 ${resp.status},无法抓取` });
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('text/plain')) {
      return res.status(422).json({ error: `目标不是网页(${ct.split(';')[0]}),暂不支持解析` });
    }
    const html = (await resp.text()).slice(0, 500_000);
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim().slice(0, 120);
    let text = html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>|<!--[\s\S]*?-->/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/[ \t\u00a0]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim();
    if (text.length < 80) return res.status(422).json({ error: '页面未提取到有效正文(可能需要登录或为动态渲染站点)' });
    text = text.slice(0, 6000);
    return res.status(200).json({ title, text, length: text.length });
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? '抓取超时(12s)' : '抓取失败:' + (e?.message || '网络错误');
    return res.status(502).json({ error: msg });
  }
}
