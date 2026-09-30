(() => {
  const sections = [...document.querySelectorAll('main > section')];
  const filters = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('article')];
  const dialog = document.querySelector('#viewer');
  const photo = document.querySelector('#viewer-picture');
  const title = document.querySelector('#viewer-name');
  const meta = document.querySelector('#viewer-meta');
  const position = document.querySelector('#viewer-position');
  let selected = 0;
  let openedBy;
  let swipeStart;

  function filter(element) {
    if (element !== 'all' && !sections.some(s => s.id === element)) element = 'all';
    sections.forEach(section => { section.hidden = element !== 'all' && section.id !== element; });
    filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === element)));
  }
  filters.forEach(button => button.addEventListener('click', () => {
    filter(button.dataset.filter);
    history.replaceState(null, '', button.dataset.filter === 'all' ? location.pathname : '#' + button.dataset.filter);
    document.querySelector('main').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }));
  filter(location.hash.slice(1) || 'all');

  function show(index) {
    selected = (index + cards.length) % cards.length;
    const card = cards[selected];
    photo.src = card.querySelector('.art').href;
    photo.alt = card.querySelector('img').alt;
    title.textContent = card.querySelector('h3').textContent;
    meta.textContent = card.closest('section').querySelector('.eyebrow').textContent + ' · ' + card.querySelector('.meta span').textContent;
    position.textContent = `${selected + 1} of ${cards.length} · Swipe to browse`;
  }
  cards.forEach((card, index) => card.querySelector('.art').addEventListener('click', event => {
    event.preventDefault();
    openedBy = event.currentTarget;
    show(index);
    document.body.classList.add('viewer-open');
    dialog.showModal();
  }));
  document.querySelector('#viewer-close').addEventListener('click', () => dialog.close());
  document.querySelector('#viewer-prev').addEventListener('click', () => show(selected - 1));
  document.querySelector('#viewer-next').addEventListener('click', () => show(selected + 1));
  dialog.addEventListener('close', () => {
    document.body.classList.remove('viewer-open');
    openedBy?.focus({ preventScroll: true });
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') { event.preventDefault(); show(selected + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(selected - 1); }
  });
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  photo.addEventListener('touchstart', event => {
    swipeStart = event.touches.length === 1 ? {x:event.touches[0].clientX,y:event.touches[0].clientY} : null;
  }, {passive:true});
  photo.addEventListener('touchend', event => {
    if (!swipeStart || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - swipeStart.x;
    const dy = event.changedTouches[0].clientY - swipeStart.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) show(selected + (dx < 0 ? 1 : -1));
    swipeStart = null;
  }, {passive:true});
})();
