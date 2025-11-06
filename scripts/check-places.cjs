const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({args: ['--no-sandbox', '--disable-setuid-sandbox']});
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.toString()));

  const url = 'https://valleyairporterapp.web.app/booking';
  console.log('Opening', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  // small delay to allow scripts to run
  await new Promise((res) => setTimeout(res, 2000));

  // try several heuristics to find the autocomplete input
  const selectors = [
    'input[placeholder*="pickup"]',
    'input[placeholder*="Search"]',
    'input[placeholder*="Address"]',
    'input[placeholder]'
  ];

  let input = null;
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout: 500 });
      input = await page.$(sel);
    } catch (e) {
      input = null
    }
    if (input) {
      console.log('Found input with selector', sel);
      break;
    }
  }

  if (!input) {
    console.log('No matching input found — collecting diagnostics...');
    const diagnostics = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input')).map((i) => ({
        outerHTML: i.outerHTML.slice(0, 300),
        placeholder: i.getAttribute('placeholder'),
        value: i.value,
        rect: (() => {
          const r = i.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        })(),
        styles: window.getComputedStyle(i) ? {
          display: window.getComputedStyle(i).display,
          visibility: window.getComputedStyle(i).visibility,
          opacity: window.getComputedStyle(i).opacity,
        } : {}
      }));

      const pac = Array.from(document.querySelectorAll('.pac-container')).map(n => ({outerHTML: n.outerHTML.slice(0,300), rect: (()=>{const r=n.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}})()}));

      // check for google namespace
      const hasGoogle = typeof window.google !== 'undefined';
      const hasMaps = !!(window.google && window.google.maps);
      const hasPlaces = !!(window.google && window.google.maps && window.google.maps.places);

      return { inputs: inputs.slice(0, 20), pac, hasGoogle, hasMaps, hasPlaces, userAgent: navigator.userAgent };
    });

    console.log('Diagnostics:', JSON.stringify(diagnostics, null, 2));
    await browser.close();
    return;
  }

  await input.focus();
  await page.keyboard.type('3303', { delay: 120 });
  await new Promise((res) => setTimeout(res, 2000));

  const pacExists = await page.$('.pac-container');
  console.log('pac-container exists?', !!pacExists);

  if (pacExists) {
    const items = await page.evaluate(() => Array.from(document.querySelectorAll('.pac-item')).map(n => n.textContent?.trim()));
    console.log('pac items:', items);
  }

  await browser.close();
  console.log('Done');
})();
