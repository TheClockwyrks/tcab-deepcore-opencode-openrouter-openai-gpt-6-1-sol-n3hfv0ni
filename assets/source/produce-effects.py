"""One-time authored particle and sound production using the supplied tools."""
import json, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SRC=ROOT/'assets/source'; (ROOT/'assets/fx').mkdir(exist_ok=True);(ROOT/'assets/audio').mkdir(exist_ok=True)
def run(tool,config,*args):subprocess.run([tool,'--config',str(config),*map(str,args)],check=True,stdout=subprocess.DEVNULL)
effects={
 'gas-seep':(10,22,1500,7,'#b6dfbc',.18),
 'drill-debris':(18,95,460,3,'#d4b18a',.8),
 'jetpack-exhaust':(23,120,350,6,'#a0eaf4',.8),
 'ore-sparkle':(18,75,650,3,'#ffe7a3',1),
 'material-shimmer':(40,100,1100,4,'#a7f8e0',1),
 'gas-explosion':(90,290,900,10,'#ffb77c',1),
 'lava-embers':(22,75,800,4,'#ff9a52',.8),
 'impact-dust':(26,100,600,7,'#baa58d',.5),
 'core-extract':(70,160,1300,5,'#ffd697',1),
 'core-detonation':(180,540,1800,16,'#ffb783',1),
 'launch-exhaust':(90,230,1700,13,'#d8e4da',.8),
 'death-burst':(70,180,1000,5,'#b9dbe0',.9),
}
for name,(burst,speed,life,size,color,opacity) in effects.items():
    cfg=SRC/(name+'.config.json')
    cfg.write_text(json.dumps(dict(width=400,height=400,duration_ms=2000,fps=24,seed=16,actions=str(SRC/(name+'.ops.json')),preview=str(SRC/(name+'.gif')),system=str(ROOT/'assets/fx'/(name+'.json')))))
    run('particle-2d',cfg,'init')
    direction=-1 if name in ['jetpack-exhaust','launch-exhaust'] else 1
    cone=22 if direction==-1 else (35 if name=='gas-seep' else 180)
    run('particle-2d',cfg,'add-emitter','--name','body','--shape','disc','--radius',18 if name=='gas-seep' else 3,'--x',200,'--y',200,'--burst',burst,'--lifetime',life,'--lifetime-spread',life*.3,'--speed',speed,'--speed-spread',speed*.4,'--dir-y',direction,'--cone-angle',cone)
    run('particle-2d',cfg,'set-particle','--emitter','body','--size-from',size,'--size-to',size*2 if name=='gas-seep' else 0,'--opacity-from',opacity,'--opacity-to',0,'--color-gradient',color+'@0,#526575@1')
    run('particle-2d',cfg,'set-forces','--drag',1.2,'--turbulence','15,0.03','--gravity',-40 if name in ['drill-debris','impact-dust'] else 0)
    if 'explosion' in name or name=='core-detonation':
        run('particle-2d',cfg,'add-emitter','--name','shock','--shape','disc','--radius',4,'--x',200,'--y',200,'--burst',80,'--lifetime',300,'--speed',speed*1.25,'--cone-angle',180)
        run('particle-2d',cfg,'set-particle','--emitter','shock','--size-from',4,'--size-to',1,'--color-gradient','#fff3ce@0,#ff9966@1')
        run('particle-2d',cfg,'add-emitter','--name','flash','--shape','point','--x',200,'--y',200,'--burst',1,'--lifetime',180,'--speed',0)
        run('particle-2d',cfg,'set-particle','--emitter','flash','--size-from',60 if name=='gas-explosion' else 120,'--size-to',0,'--color-gradient','#fff7de@0,#ffae73@1')
    run('particle-2d',cfg,'render')

sounds={
 'drill':('saw',75,700,-27), 'thrust':('noise',90,900,-27),
 'ore-pickup':('triangle',780,240,-20), 'material-chime':('sine',660,800,-20),
 'gas-explosion':('noise',60,1200,-21),'lava-sizzle':('noise',300,700,-27),
 'impact':('sine',80,420,-17),'fabricate':('triangle',520,450,-23),
 'launch':('noise',65,2600,-20),'death':('saw',130,1100,-26),
 'alarm-fuel':('sine',680,210,-25),'alarm-core':('triangle',1000,140,-24)
}
samples={'ore-pickup':'mech_clip_load','material-chime':'clang_metal','impact':'impact_metal_hollow','fabricate':'mech_ratchet','gas-explosion':'cannon_body_heavy'}
for name,(wave,freq,dur,gain) in sounds.items():
    tool='sfx-sample' if name in samples else 'sfx-synth';cfg=SRC/(name+'.audio.json')
    cfg.write_text(json.dumps(dict(sample_rate=22050,channels='mono',max_duration_ms=dur+500,seed=51,actions=str(SRC/(name+'.sound-ops.json')),preview=str(SRC/(name+'.wave.png')),wav=str(ROOT/'assets/audio'/(name+'.wav')))))
    run(tool,cfg,'init');run(tool,cfg,'add-voice','--name','body','--wave',wave,'--freq',freq,'--dur',dur,'--gain',gain)
    run(tool,cfg,'set-envelope','--voice','body','--env','gate' if name in ['drill','thrust'] else 'pluck')
    if wave!='noise':run(tool,cfg,'set-pitch','--voice','body','--slide-to',freq*(1.5 if 'pickup' in name or name=='fabricate' else .45),'--over',dur)
    if name in samples:run(tool,cfg,'add-sample','--name',samples[name],'--t',0,'--gain',-25,'--fade-out',180)
    if name=='material-chime':
        for i,freq in enumerate([990,1320]):run(tool,cfg,'add-voice','--name','bell'+str(i),'--wave','sine','--freq',freq,'--dur',500,'--start',i*110,'--gain',-25)
    run(tool,cfg,'render')
cfg=SRC/'music.config.json'
cfg.write_text(json.dumps(dict(sample_rate=22050,channels='stereo',max_duration_ms=24000,seed=16,actions=str(SRC/'music.ops.json'),preview=str(SRC/'music-roll.png'),wav=str(ROOT/'assets/audio/music.wav'),mid=str(ROOT/'assets/audio/music.mid'))))
run('music',cfg,'init');run('music',cfg,'set-tempo','--bpm',80)
for track,instrument,gain,env in [('sub','sine',-25,'swell'),('pad','synth_pad',-28,'swell'),('bell','electric_piano',-28,'pluck')]:
    run('music',cfg,'define-track','--name',track,'--instrument',instrument);run('music',cfg,'set-track-fx','--track',track,'--gain',gain,'--reverb',.35,'--env',env)
for bar,root in enumerate([38,34,41,36]):
    run('music',cfg,'add-note','--track','sub','--pitch',root,'--t',bar*8,'--dur',7.5,'--velocity',65)
    for offset in [12,19,26]:run('music',cfg,'add-note','--track','pad','--pitch',root+offset,'--t',bar*8,'--dur',7,'--velocity',50)
    for i,offset in enumerate([24,31,36,26]):run('music',cfg,'add-note','--track','bell','--pitch',root+offset,'--t',bar*8+i*2,'--dur',1.5,'--velocity',45)
run('music',cfg,'render')
print('Twelve particle systems, twelve sound cues, and an original descent score produced.')
