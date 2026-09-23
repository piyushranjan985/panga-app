// Blocking inline script (runs before first paint) so the page never
// flashes the wrong theme. Reads a plain localStorage flag, not a cookie
// -- theme is a per-device convenience, not something that needs to
// follow an admin between machines.
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('vybeadmin-theme');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
