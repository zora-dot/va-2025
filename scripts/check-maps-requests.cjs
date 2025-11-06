const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({args: ['--no-sandbox', '--disable-setuid-sandbox']});
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);

  page.on('console', (msg) => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.toString()));

  const mapsRequests = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('maps.googleapis.com')) {
      console.log('REQUEST ->', url);
      mapsRequests.push({url, request: true});
    }
  });

  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('maps.googleapis.com')) {
      try {
        const status = res.status();
        const headers = res.headers();
        let text = '';
        try {
          text = await res.text();
        } catch (e) {
          text = `failed to read body: ${e.message}`;
        }
        console.log('RESPONSE ->', url, 'status:', status, 'content-type:', headers['content-type']);
        if (text && text.length < 2000) console.log('BODY:', text.slice(0, 2000));
        mapsRequests.push({url, response: true, status, headers, bodySnippet: text.slice(0, 2000)});
      } catch (e) {
        console.log('Error reading response for', url, e.toString());
      }
    }
  });

  const url = 'https://valleyairporterapp.web.app/booking';
  console.log('Opening', url);
  await page.goto(url, { waitUntil: 'networkidle2' });

  // select "Any Address in Abbotsford" to mount the autocomplete field
  try {
    await page.select('select[name="origin"]', 'Any Address in Abbotsford');
  } catch (err) {
    console.log('Unable to select origin option:', err?.message || err);
  }

  // wait for input to appear
  try {
    await page.waitForSelector('input[placeholder="Search Abbotsford pickup address"]', { timeout: 5000 });
    const input = await page.$('input[placeholder="Search Abbotsford pickup address"]');
    if (input) {
      await input.focus();
        await page.keyboard.type('333 mc');
        const typedValue = await page.evaluate(() => document.querySelector('input[placeholder="Search Abbotsford pickup address"]').value);
        console.log('Typed value inside page:', typedValue);
    }
  } catch (err) {
    console.log('Autocomplete input not found:', err?.message || err);
  }

  // wait for dynamic scripts and any autocomplete network calls
  await new Promise((res) => setTimeout(res, 6000));

  const suggestionHtml = await page.evaluate(() => {
    const containers = Array.from(document.querySelectorAll('.pac-container'));
    return containers.map((el) => ({
      text: el.innerText,
      visible: getComputedStyle(el).display !== 'none',
    }));
  });

  const diagnostics = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script')).map(s => s.src).filter(Boolean);
    const inputs = Array.from(document.querySelectorAll('input')).map(i => ({placeholder: i.getAttribute('placeholder'), outerHTML: i.outerHTML.slice(0,300)}));
    return {scripts, inputs, hasGoogle: typeof window.google !== 'undefined', hasMaps: !!(window.google && window.google.maps), hasPlaces: !!(window.google && window.google.maps && window.google.maps.places)};
  });

  diagnostics.suggestions = suggestionHtml;

  console.log('Diagnostics:', JSON.stringify(diagnostics, null, 2));
  console.log('Maps requests captured:', JSON.stringify(mapsRequests, null, 2));

  await browser.close();
  console.log('Done');
})();
