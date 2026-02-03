// Fade in content
setTimeout(function() {
  document.getElementById('content').classList.add('visible');
}, 100);

// Back link closes the tab
document.getElementById('backLink').addEventListener('click', function(e) {
  e.preventDefault();
  window.close();
});
