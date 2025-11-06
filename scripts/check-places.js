const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({args: ['--no-sandbox', '--disable-setuid-sandbox']});
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.toString()));

  const url = 'https://valleyairporterapp.web.app/booking';
  console.log('Opening', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForTimeout(2000);

  // try several heuristics to find the autocomplete input
  const selectors = [
    'input[placeholder*="pickup"]',
    'input[placeholder*="Search"]',
    'input[placeholder*="Address"]',
    'input[placeholder]'
  ];

  let input = null;
  for (const sel of selectors) {
    input = await page.$(sel);
    if (input) {
      console.log('Found input with selector', sel);
      break;
    }
  }

  if (!input) {
    console.log('No matching input found; listing first 10 input placeholders...');
    const placeholders = await page.evaluate(() => Array.from(document.querySelectorAll('input')).slice(0,10).map(i=>i.placeholder));
    console.log('Placeholders:', placeholders);
    await browser.close();
    return;
  }

  await input.focus();
  await page.keyboard.type('3303', { delay: 120 });
  await page.waitForTimeout(2000);

  const pacExists = await page.$('.pac-container');
  console.log('pac-container exists?', !!pacExists);

  if (pacExists) {
    const items = await page.evaluate(() => Array.from(document.querySelectorAll('.pac-item')).map(n => n.textContent?.trim()));
    console.log('pac items:', items);
  }

  await browser.close();
  console.log('Done');
})();
