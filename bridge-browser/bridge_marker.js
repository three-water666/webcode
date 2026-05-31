(() => {
  document.documentElement.setAttribute('data-extension-installed', 'true');
  window.dispatchEvent(new Event('webcode-bridge-extension-installed'));
})();
