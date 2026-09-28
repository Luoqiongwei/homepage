// 同一份页面用于独立浏览和紧凑 iframe，避免维护两份互动实现。
if (new URLSearchParams(location.search).get('embed') === '1') {
  document.documentElement.dataset.embedded = 'true';
  document.addEventListener('DOMContentLoaded', () => {
    const nav = document.createElement('nav');
    nav.id = 'embedded-actions';
    nav.setAttribute('aria-label', '角色互动');
    nav.append(...document.querySelector('.companionship').children, document.querySelector('#pause'));
    for (const button of nav.querySelectorAll('button')) button.disabled = true;
    document.body.insertBefore(nav, document.querySelector('.model-rights'));
  }, {once:true});
}
