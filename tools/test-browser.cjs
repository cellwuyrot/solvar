// Optional Linux QA runner. Requires Playwright via SOLVAR_PLAYWRIGHT_MODULE (or installed locally), Chromium and openssl.
const { chromium } = require(process.env.SOLVAR_PLAYWRIGHT_MODULE || 'playwright');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, openSync, closeSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname } = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync, spawn } = require('node:child_process');
const http = require('node:http'), https = require('node:https');
const { strict: assert } = require('node:assert');
const { createClient } = require('@libsql/client');
const root = resolve(__dirname, '..'), cwd = join(root, 'packages/web');
const directory = mkdtempSync(join(tmpdir(), 'solvar-browser-test-'));
const output = join(root, 'qa-hardening'); mkdirSync(output, { recursive: true });
const bun = join(dirname(require.resolve('bun/package.json')), 'bin/bun.exe');
const port = 18448, upstream = 18449, origin = `https://localhost:${port}`;
const env = { ...process.env, NODE_ENV: 'production', DATABASE_URL: 'file:' + join(directory, 'browser.db'), DATABASE_AUTH_TOKEN: '',
  WEBSITE_URL: origin, HOST: '127.0.0.1', PORT: String(upstream), BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
  ADMIN_EMAIL: 'owner@example.invalid', ADMIN_PASSWORD: randomBytes(24).toString('base64url'), NOTIFICATION_WORKER_ENABLED: 'false',
  SMTP_HOST: '', SMTP_FROM: '', SMTP_USER: '', SMTP_PASSWORD: '', SMTP_ALLOW_INSECURE_LOCAL: 'false', TELEGRAM_BOT_TOKEN: '' };
function run(args) { const r = spawnSync(bun, args, { cwd, env: { ...env, NODE_ENV: 'test' }, encoding: 'utf8', timeout: 120000 }); if (r.status) throw new Error('Fixture setup failed (details withheld)'); }
run(['x','--no-install','drizzle-kit','push','--force']); run(['tools/seed.ts']);
const key = join(directory,'key.pem'), cert = join(directory,'cert.pem');
const ssl = spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
if(ssl.status) throw new Error('Local openssl required for production Secure-cookie tests');
const fd = openSync(join(output,'browser-runtime.log'),'w',0o600);
const child = spawn(bun,['src/__server.ts'],{cwd, env, stdio:['ignore',fd,fd]});
const proxy = https.createServer({key:readFileSync(key),cert:readFileSync(cert)},(req,res)=> {
  const target=http.request({hostname:'127.0.0.1',port:upstream,path:req.url,method:req.method,headers:req.headers}, response=> {res.writeHead(response.statusCode,response.headers);response.pipe(res);});
  target.on('error',()=>{res.writeHead(503);res.end('Local test proxy unavailable');});req.pipe(target);
});
const log=[], errors=[];let browser;
const pass=name=>log.push('PASS '+name);
(async()=>{
  await new Promise(r=>proxy.listen(port,'127.0.0.1',r));
  for(let n=0;n<80;n++){try{const response=await new Promise((ok,bad)=>http.get(`http://127.0.0.1:${upstream}/api/health`,ok).on('error',bad));response.resume();if(response.statusCode===200)break;}catch{}await new Promise(r=>setTimeout(r,100));if(n===79)throw new Error('Runtime did not start');}
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/local/bin/chromium',args:['--no-sandbox']});
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='localhost'?route.continue():route.abort());
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error' && /Content Security Policy|Refused to|Uncaught/i.test(e.text()))errors.push(e.text());});
  const home=await page.goto(origin+'/');assert.equal(home.status(),200);await page.getByRole('heading',{name:'Контакты',exact:true}).waitFor();
  assert(!await page.getByRole('button',{name:/В корзину|Смотреть каталог/}).count());
  assert.match(home.headers()['content-security-policy'],/frame-ancestors 'none'/);
  await page.screenshot({path:join(output,'information-desktop.png'),fullPage:true});
  pass('information page has no commerce controls; production CSP present');
  const sitemap=await context.request.get(origin+'/sitemap.xml');const xml=await sitemap.text();assert(!xml.includes('/products/'));assert(!xml.includes('/collections/'));
  const missing=await page.goto(origin+'/products/non-existent');assert.equal(missing.status(),404);assert.match(missing.headers()['x-robots-tag'],/noindex/);
  await page.getByRole('heading',{name:'Страница не найдена',exact:true}).waitFor();
  assert.equal((await context.request.get(origin+'/.env')).status(),404);
  assert.equal((await context.request.get(origin+'/api/ready')).status(),200);
  pass('legacy product route 404/noindex; safe sitemap; hidden files denied; readiness OK');
  await page.goto(origin+'/admin');await page.getByLabel('Email',{exact:true}).fill(env.ADMIN_EMAIL);await page.getByLabel('Пароль',{exact:true}).fill(env.ADMIN_PASSWORD);await page.getByRole('button',{name:'Войти',exact:true}).click();
  await page.getByRole('heading',{name:'Каталог товаров',exact:true}).waitFor();
  const cookies=await context.cookies();assert(cookies.some(c=>c.name.includes('session_token')&&c.httpOnly&&c.secure&&c.sameSite==='Lax'));
  await page.getByRole('button',{name:'Администраторы',exact:true}).click();await page.getByRole('heading',{name:'Доступ команды',exact:true}).waitFor();
  await page.screenshot({path:join(output,'administrators-desktop.png'),fullPage:true});
  await page.getByLabel('Пароль владельца',{exact:true}).fill(env.ADMIN_PASSWORD);await page.getByLabel('Имя администратора',{exact:true}).fill('Isolated browser staff');await page.getByLabel('Email администратора',{exact:true}).fill('browser-staff@example.invalid');await page.getByRole('button',{name:'Создать и пригласить',exact:true}).click();
  await page.getByText('browser-staff@example.invalid',{exact:true}).waitFor();
  await page.getByRole('status').filter({hasText:'SMTP не настроен'}).waitFor();
  assert.equal(await page.getByLabel('Пароль владельца',{exact:true}).inputValue(),'');
  pass('owner login uses Secure/HttpOnly/Lax cookie; admin creation UI persists account despite SMTP not configured');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(output,'administrators-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Товары',exact:true}).click();await page.getByRole('button',{name:'Добавить товар',exact:true}).click();await page.locator('dialog[open]').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);
  await page.getByRole('button',{name:'Логотип',exact:true}).click();await page.getByRole('heading',{name:'Изображения бренда',exact:true}).waitFor();assert.equal(await page.locator('input[type=file]:visible').count(),3);
  pass('390px admin layout has no horizontal overflow; native dialog Escape; logo upload keyboard controls visible');
  const fixture=createClient({url:env.DATABASE_URL});
  const staff=(await fixture.execute("SELECT id FROM user WHERE email='browser-staff@example.invalid'")).rows[0];const token=randomBytes(24).toString('hex');
  await fixture.execute({sql:'INSERT INTO verification(id,identifier,value,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)',args:[randomBytes(16).toString('hex'),'reset-password:'+token,String(staff.id),Date.now()+3600000,Date.now(),Date.now()]});fixture.close();
  const resetPage=await context.newPage();await resetPage.setViewportSize({width:390,height:844});resetPage.on('pageerror',e=>errors.push(e.message));await resetPage.goto(origin+'/admin/reset-password?token='+token);await resetPage.getByRole('heading',{name:'Новый пароль',exact:true}).waitFor();assert(!resetPage.url().includes('token='));
  await resetPage.getByLabel('Новый пароль',{exact:true}).fill('BrowserTestPassword-123!');await resetPage.getByLabel('Повторите пароль',{exact:true}).fill('BrowserTestPassword-123!');await resetPage.getByRole('button',{name:'Сохранить пароль',exact:true}).click();await resetPage.getByRole('status').filter({hasText:'Пароль сохранён'}).waitFor();
  await resetPage.screenshot({path:join(output,'reset-password-mobile.png'),fullPage:true});
  pass('one-use reset UI works and removes token from browser URL');
  const mobileContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,reducedMotion:'reduce'});
  const mobile=await mobileContext.newPage();const cdp=await mobileContext.newCDPSession(mobile);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750,connectionType:'cellular3g'});
  await mobile.addInitScript(()=>{window.__qaLcp=0;new PerformanceObserver(list=>{window.__qaLcp=list.getEntries().at(-1)?.startTime||0;}).observe({type:'largest-contentful-paint',buffered:true});});
  await mobile.goto(origin+'/');await mobile.getByRole('heading',{name:'Контакты',exact:true}).waitFor();await mobile.evaluate(()=>document.fonts.ready);await mobile.waitForTimeout(1200);
  const metrics=await mobile.evaluate(()=>({lcpMs:window.__qaLcp,domContentLoadedMs:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,jsEncodedBytes:performance.getEntriesByType('resource').filter(r=>/\.js(?:\?|$)/.test(r.name)).reduce((a,r)=>a+r.encodedBodySize,0),jsResources:performance.getEntriesByType('resource').filter(r=>/\.js(?:\?|$)/.test(r.name)).map(r=>({name:r.name.split('/').at(-1),bytes:r.encodedBodySize,initiator:r.initiatorType})),horizontalOverflow:document.documentElement.scrollWidth>innerWidth}));
  assert(!metrics.horizontalOverflow);await mobile.getByRole('button',{name:'Меню',exact:true}).click();assert.equal(await mobile.getByRole('button',{name:'Меню',exact:true}).getAttribute('aria-expanded'),'true');
  await mobile.screenshot({path:join(output,'information-mobile.png'),fullPage:true});
  writeFileSync(join(output,'mobile-emulation-metrics.json'),JSON.stringify({environment:'Chromium desktop emulating 390x844, CPU4x, latency150ms, download1.6Mbps, single cold run; NOT real mobile hardware',...metrics},null,2));
  pass('mobile menu and reduced-motion layout; emulated mobile metrics recorded without claiming real-device performance');
  assert.deepEqual(errors,[]);pass('no JavaScript exceptions or CSP violations in exercised routes');
  writeFileSync(join(output,'browser-tests.log'),log.join('\n')+'\n');console.log(log.join('\n'));
})().catch(e=>{writeFileSync(join(output,'browser-tests.log'),log.join('\n')+'\nFAIL '+e.message+'\n');console.error('Browser tests FAIL:',e.message);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(r=>proxy.close(r));child.kill('SIGTERM');closeSync(fd);});
