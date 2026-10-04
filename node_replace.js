const fs = require('fs');
let c = fs.readFileSync('frontend/script.js', 'utf8');

const oldFunc = c.match(/function renderReunionPhotos\(\) \{[\s\S]*?\n    \}/)[0];

const newFunc = `    async function renderReunionPhotos() {
      const container = document.getElementById("reunion-photo-grid");
      if (!container) return;
      try {
        const res = await apiGet('reunion', {});
        const parts = res.parts || [];
        const photos = res.photos || [];
        
        let html = '';
        parts.forEach(part => {
          const shots = photos.filter(p => p.part === part.n);
          if (!shots.length) return;
          html += \`
          <section class="mb-12 last:mb-0">
            <div class="flex items-center gap-3.5 mb-5">
              <span class="shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-sky-500 text-white flex items-center justify-center shadow-md"><i data-lucide="\${part.icon}" class="w-5 h-5"></i></span>
              <div class="min-w-0">
                <h3 class="text-base sm:text-lg font-extrabold text-slate-900 leading-snug">\${escapeHtml(part.bn)}</h3>
                <p class="text-[11px] sm:text-xs text-slate-500 font-semibold">\${escapeHtml(part.en)} &bull; \${bnNum(shots.length)} টি ছবি</p>
              </div>
              <span class="ml-auto shrink-0 px-3 py-1 rounded-full bg-white border border-slate-200 text-[10px] sm:text-[11px] font-bold text-slate-500 tracking-wide">পর্ব \${bnNum(part.n)}</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              \${shots.map((p, idx) => reunionCardHtml(p, idx)).join('')}
            </div>
          </section>\`;
        });
        container.innerHTML = html;
        if (window.lucide && lucide.createIcons) lucide.createIcons();
        
        RD_REUNION_VIEW.parts = parts;
        RD_REUNION_VIEW.photos = photos;
      } catch (err) {
        console.error(err);
      }
    }`;

c = c.replace(oldFunc, newFunc);
fs.writeFileSync('frontend/script.js', c);
console.log('Replaced!');
