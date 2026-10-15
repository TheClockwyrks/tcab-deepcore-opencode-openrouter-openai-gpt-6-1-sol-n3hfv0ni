// One-time showcase capture. Run against `npm run dev` with project Playwright.
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
page.on('pageerror',e=>{throw e;});
await page.goto('http://localhost:5173');await page.waitForTimeout(500);
const session=await page.evaluateHandle(async()=>{
  const {createEngine,ConstantClock}=await import('/node_modules/@clockwyrks/simple-2d/dist/index.js');
  const {game,BACKGROUND}=await import('/src/game.ts');
  const canvas=document.createElement('canvas');
  canvas.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:99;';document.body.append(canvas);
  const engine=createEngine({canvas,width:1280,height:720,game,background:BACKGROUND,clock:new ConstantClock(1000/30)});
  await engine.initialize();const d=engine.debug;
  const apply=(name,...args)=>engine.apply(s=>d[name](s,...args));
  const key=(code,down=true)=>document.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true}));
  key('Enter');await engine.advance(1);key('Enter',false);key('Enter');await engine.advance(1);key('Enter',false);key('Enter');await engine.advance(1);key('Enter',false);
  return {engine,apply,key,canvas};
});
await session.evaluate(async({engine,apply})=>{
  apply('setMinerPosition',1692,8);apply('setRocketInstalled',3);apply('setCredits',2380);apply('setCargo','argenite',3);
  await engine.advance(2);
});
await page.screenshot({path:'showcase/surface.png'});
await session.evaluate(async({engine,apply,key})=>{
  apply('reset');apply('setWorldSize','quick');apply('generateMine');apply('setScreen','in-mine');
  for(const track of ['fuel','hull','jetpack','drill'])apply('setTier',track,4);
  apply('setFuel',360);apply('setHull',300);apply('setCredits',1725);
  for(let r=75;r<91;r++)apply('setTile',16,r,'tunnel');
  for(let r=91;r<105;r++)apply('setOreTile',16,r,r%3===0?'argenite':'cobaltine');
  for(let r=84;r<100;r++){apply('setOreTile',13,r,'argenite');apply('setOreTile',20,r,'cobaltine');}
  apply('setMinerPosition',16*80+12,91*80-72);apply('setMinerVelocity',0,0);await engine.advance(1);
  engine.startRecording();key('KeyS');await engine.advance(72);key('KeyS',false);
  key('Space');await engine.advance(72);key('Space',false);await engine.advance(6);
});
const recording=await session.evaluate(({engine})=>engine.stopRecording());
await writeFile('showcase/descent.json.gz',gzipSync(JSON.stringify(recording),{level:9}));
console.log(`Recorded ${recording.frames.length} frames, ${recording.images.length} sprite images.`);
await session.evaluate(async({engine,apply,key})=>{
  apply('reset');apply('setWorldSize','quick');apply('generateMine');apply('setScreen','in-mine');
  for(const track of ['fuel','hull','jetpack','drill'])apply('setTier',track,4);
  apply('setTier','scanner',2);apply('setFuel',285);apply('setHull',247);apply('setCredits',6420);apply('setCargo','voltite',7);apply('setCargo','halcite',4);
  for(let r=151;r<=159;r++)apply('setTile',15,r,'tunnel');
  for(let c=10;c<=18;c++)apply('setTile',c,159,'tunnel');
  for(let c=16;c<=20;c++)apply('setOreTile',c,160,c%2?'halcite':'voltite');
  for(let r=160;r<=162;r++)for(let c=20;c<=23;c++)apply('setTile',c,r,'lava');
  for(let r=1;r<250;r++)for(let c=1;c<31;c++){const t=engine.debug.tileAt(engine.state,c,r);if(t.material==='cryenite')apply('setTile',c,r,'rock');}
  apply('setMaterialTile',21,157,'cryenite');apply('setMinerPosition',15*80+12,160*80-72);apply('setMinerVelocity',0,0);
  key('Space');await engine.advance(8);key('Space',false);
});
await page.screenshot({path:'showcase/deepstone.png'});
await session.evaluate(({engine})=>engine.destroy());await browser.close();
