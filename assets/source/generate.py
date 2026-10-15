"""One-time original Deepcore sprite production. Requires draw/draw-sheet.
The application build only bundles the resulting committed PNGs.
"""
import json, math, random, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
random.seed(76123)

class Art:
    def __init__(self, w=80, h=80): self.w,self.h,self.ops=w,h,[]
    def rect(self,x,y,w,h,c):
        if w>0 and h>0:self.ops.append(dict(op='fill_rect',x=int(x),y=int(y),width=int(w),height=int(h),color=c))
    def circle(self,x,y,r,c):self.ops.append(dict(op='fill_circle',cx=int(x),cy=int(y),r=int(r),color=c))
    def line(self,x,y,xx,yy,c):self.ops.append(dict(op='line',x0=int(x),y0=int(y),x1=int(xx),y1=int(yy),color=c))
    def poly(self,pts,c):
        for y in range(max(0,int(min(p[1] for p in pts))),min(self.h,int(max(p[1] for p in pts))+1)):
            cuts=[]
            for (x1,y1),(x2,y2) in zip(pts,pts[1:]+pts[:1]):
                if (y1<=y<y2) or (y2<=y<y1):cuts.append(x1+(y-y1)*(x2-x1)/(y2-y1))
            cuts.sort()
            for a,b in zip(cuts[::2],cuts[1::2]):self.rect(a,y,max(1,b-a+1),1,c)
    def save(self,path,sheet=False):
        out=ROOT/'assets'/path;out.parent.mkdir(parents=True,exist_ok=True)
        log=ROOT/'assets/source'/ (path.replace('/','_')+'.json');log.write_text(json.dumps(self.ops))
        subprocess.run(['draw-sheet' if sheet else 'draw','render','--actions',str(log),'--out',str(out),'--width',str(self.w),'--height',str(self.h),'--no-layers'],check=True,stdout=subprocess.DEVNULL)

bands={'topsoil':('#4a3833','#60483d','#2e292b','#80634c'),'rockbed':('#38444b','#4b5860','#252e36','#64717a'),'deepstone':('#282e40','#3a4054','#1c2232','#51596c'),'coreshell':('#452f39','#5c3941','#29222e','#865047')}
for band,p in bands.items():
    for variant in range(3):
        a=Art();a.rect(0,0,80,80,p[0])
        for i in range(1400):
            x,y=random.randrange(80),random.randrange(80);a.rect(x,y,random.choice([1,1,2,3]),1,random.choice(p))
        for i in range(10):
            x,y=random.randrange(80),random.randrange(80);a.line(x,y,x+random.randrange(4,18),y-2,p[2])
        a.save(f'tiles/{band}-{variant}.png')
a=Art();a.rect(0,0,80,80,'#101c29')
for i in range(500):a.rect(random.randrange(80),random.randrange(80),2,1,random.choice(['#152231','#1a2938','#0d1722']))
a.save('tiles/tunnel.png')
for n in range(2):
    a=Art();a.poly([(8,20),(25,5),(62,8),(77,30),(71,66),(47,77),(14,64)],'#141d29');a.poly([(11,20),(26,8),(60,11),(72,30),(67,61),(44,71),(17,59)],'#667985');a.poly([(11,20),(26,8),(60,11),(39,26)],'#a3adb2');a.poly([(39,26),(60,11),(72,30),(67,61),(50,46)],'#455966');a.line(21,44,50,28,'#bac3c5');a.line(19,47,48,31,'#314353')
    if n:a.poly([(17,50),(36,55),(53,43),(65,56),(44,71),(17,59)],'#516570');a.line(24,55,47,60,'#b2bdba');a.line(29,17,41,20,'#d7d9c7')
    a.save(f'tiles/stone-{n}.png')
a=Art();a.rect(0,0,80,80,'#1a2028')
for y in range(0,80,16):
    a.line(0,y,80,y,'#424957')
    for x in range(-16,80,32):a.line(x+(y%32),y,x+(y%32),y+16,'#0a101b')
a.save('tiles/bedrock.png')
orecolors=['#c5b49b','#bd9e65','#e28c59','#bdd8d8','#5e9fdf','#a7d75a','#c69adf','#ee8651','#f4ca67','#b2f1e5']
ores=['ferron','marlite','cuprite','argenite','cobaltine','voltite','halcite','pyronium','cindrite','adamite']
for name,color in zip(ores,orecolors):
    a=Art()
    for x in range(80):
        y=35+math.sin(x*.085)*12
        a.rect(x,y-8,1,20,color+'48');a.rect(x,y-3,1,8,color+'a0')
    for i in range(160):
        x=random.randrange(80);y=35+math.sin(x*.085)*12+random.gauss(0,7);a.rect(x,y,random.randrange(1,5),random.randrange(1,3),color+random.choice(['70','a0','dd','ff']))
    a.save(f'ore/{name}.png')
for name,c in [('verdite','#66e0a2'),('roselite','#ed87c4'),('aurite','#ffdd83')]:
    a=Art();a.poly([(22,24),(54,20),(65,37),(40,66),(15,39)],'#111f32');a.poly([(24,26),(52,23),(61,37),(40,61),(19,38)],c);a.poly([(24,26),(52,23),(45,35),(31,36)],'#e5fff0');a.poly([(19,38),(31,36),(40,61)],'#2f6e75');a.poly([(45,35),(61,37),(40,61)],'#76999c');a.line(52,16,52,30,'#ffffff');a.line(45,23,59,23,'#ffffff');a.save(f'ore/{name}.png')
for name,c in [('resonite','#6ff4c3'),('cryenite','#a8a1ff'),('core','#ffbe6e'),('core-sample','#ffde8a')]:
    a=Art()
    if name=='core':
        for r in range(35,1,-1):a.circle(40,40,r,['#7b353f','#bb5a47','#ffb367','#fff1bc'][min(3,(35-r)//9)])
        for t in range(8):
            x=40+int(math.cos(t*math.pi/4)*32);y=40+int(math.sin(t*math.pi/4)*32);a.line(40,40,x,y,'#fff4d0')
    else:
        for x,y,h in [(24,47,20),(41,51,35),(55,48,24)]:
            a.poly([(x-9,y+13),(x-8,y-h+6),(x,y-h),(x+9,y-h+8),(x+7,y+10)],'#263d51');a.poly([(x-5,y+9),(x-5,y-h+7),(x,y-h+3),(x+5,y-h+9),(x+4,y+7)],c);a.line(x,y-h+3,x,y+7,'#eefcff')
    a.save(f'materials/{name}.png')
for f in range(4):
    a=Art();a.rect(0,0,80,80,'#b84f37')
    for y in range(80):
        for x in range(0,80,2):
            v=math.sin(x*.13+math.sin(y*.11+f)*2)+math.cos(y*.18+f*.9)
            if v>.3:a.rect(x,y,2,1,'#ffbd60' if v>1.25 else '#ec7845')
    a.save(f'hazards/lava/frame{f:02}.png',True)
for f in range(4):
    a=Art()
    for j in range(f+2):
        x,y=40,40
        for step in range(4+f):
            xx=x+random.randrange(-15,16);yy=y+random.randrange(-15,16);a.line(x,y,xx,yy,'#10121bc0');a.line(x+1,y,xx+1,yy,'#d7b39b80');x,y=xx,yy
    a.save(f'tiles/crack/frame{f:02}.png',True)

# A small, carefully shaded pressure suit with a visible drill, oxygen pack,
# glass visor, shoulder armour, separated gloves and articulated boots.
states={'idle':12,'walk':6,'drill-down':4,'drill-side':4,'jetpack':4,'fall':4,'hurt':3,'fuel-out':3}
for state,count in states.items():
    for f in range(count):
        a=Art();bob=[0,-1,0,1][f%4]; lean=0
        if state=='idle':bob=round(math.sin(f*math.pi/6))
        if state.startswith('drill'):bob=f%2;lean=3
        if state=='hurt':lean=-5+f*2;bob=-2
        if state=='fuel-out':bob=4+f%2;lean=3
        if state=='jetpack':bob=-3
        def r(x,y,w,h,c):a.rect(x+lean+(4 if state=='fuel-out' and y<30 else 0),y+bob+(3 if state=='fuel-out' and y<30 else 0),w,h,c)
        # pack and twin thrusters
        r(13,30,14,29,'#101a29');r(14,32,10,23,'#607982');r(15,33,3,20,'#98abb0');r(14,53,9,6,'#263a4b');r(12,38,4,10,'#d9874d')
        if state=='jetpack':
            a.poly([(14,58),(23,58),(21,68+f%2*9),(18,77),(13,67)],'#ef854a');a.poly([(16,58),(21,58),(19,71),(16,65)],'#c8faff')
        stride=([-5,0,5,5,0,-5][f] if state=='walk' else (3 if state=='fall' else 0))
        for x,s in [(28,-stride),(42,stride)]:
            r(x+s,51,12,17,'#1a2b3b');r(x+s+2,53,8,11,'#637b83');r(x+s,67,15,7,'#102030');r(x+s+1,67,13,3,'#8ba0a3')
        r(25,30,29,26,'#162637');r(27,31,25,23,'#dc9b5e');r(29,33,7,19,'#f3c18b');r(38,32,13,20,'#b36f43');r(28,48,23,6,'#3c5262');r(35,49,9,4,'#b6c5c0');r(30,36,18,7,'#485e6c');r(32,37,5,4,'#88e0cb');r(43,38,3,2,'#ffdf9f')
        r(24,8,31,26,'#111d2d');r(26,8,27,23,'#a7b9b5');r(30,7,21,4,'#d2d6bd');r(30,13,25,15,'#294559');r(33,14,20,10,'#85dad7');r(34,15,17,3,'#d8fff2');r(34,20,8,5,'#4f9caa');r(23,14,6,11,'#ddaa6a');r(22,16,6,6,'#ffe9ad' if f%2==0 else '#c9f3eb');r(51,29,6,5,'#354b5b')
        if state=='drill-down':
            r(41,43,10,13,'#b27749');r(45,52,14,8,'#99adb0');r(47,59,10,7,'#425969');a.poly([(48+lean,65+bob),(56+lean,65+bob),(52+lean,79)],'#c3d0c7');r(41,47,8,8,'#e5bc89')
        else:
            yy=38 if state=='drill-side' else (31 if state=='fall' else (49 if state=='fuel-out' else 44))
            r(48,yy,11,10,'#d7a26f');r(55,yy+5,9,9,'#253d50');r(57,yy+3,15,9,'#92a7a6');r(58,yy+3,12,3,'#e3d7b7');a.poly([(71+lean,yy+3+bob),(79,yy+7+bob),(71+lean,yy+12+bob)],'#c6d4ce');r(62,yy+11,5,7,'#172c3e')
        a.save(f'miner/{state}/frame{f:02}.png',True)

# Surface modules share a salvage-yard language: corrugated plating, teal glass,
# copper pipes, struts, hazard markings and a readable machine silhouette.
builds=['fuel-depot','ore-market','save-pad','upgrade-shop','supply-depot','launch-pad']
for idx,name in enumerate(builds):
    a=Art(240,200)
    a.rect(10,182,220,14,'#182b39');a.rect(18,178,204,6,'#9ba49b')
    if name=='launch-pad':
        a.rect(26,164,190,16,'#60717b');a.rect(43,20,11,146,'#384d60')
        for y in range(25,156,22):a.line(45,y,80,y+22,'#b88658');a.line(80,y,45,y+22,'#b88658')
        a.rect(78,15,5,151,'#536f7d');a.rect(46,16,90,9,'#9aa9a6')
    elif name=='save-pad':
        a.rect(44,156,152,20,'#3c5663');a.rect(53,152,134,7,'#73dfc0');a.rect(106,68,27,83,'#2d4658');a.rect(89,65,60,44,'#9bb2b0');a.rect(95,70,48,31,'#203c4a');a.circle(119,85,10,'#79e5c8');a.rect(118,21,3,43,'#98b4b6');a.circle(119,20,5,'#79e5c8')
    else:
        a.poly([(24,81),(49,61),(190,61),(218,83),(218,177),(24,177)],'#1b2f40');a.rect(29,82,183,92,'#52666e');a.rect(34,88,173,80,'#344b5b')
        for x in range(36,208,9):a.rect(x,89,2,77,'#405867')
        a.rect(20,75,202,9,'#b1b8a9');a.rect(28,65,185,10,'#71858c');a.rect(52,91,100,34,'#172d3d');a.rect(58,97,88,22,'#63a7ad');a.rect(61,98,80,4,'#a2ded1')
        a.rect(72,133,52,41,'#152a38');a.rect(78,139,39,31,'#2a424f');a.rect(110,153,4,6,'#f0c586')
        a.rect(164,93,29,73,'#b17c54');a.rect(168,99,21,29,'#173544');a.rect(171,104,15,16,'#8dd9cb')
        for x in range(30,210,20):a.poly([(x,171),(x+10,171),(x+5,177),(x-5,177)],'#e3b26b')
        if idx==0:
            a.rect(4,103,26,68,'#78949a');a.circle(17,103,13,'#a4b8b5');a.rect(7,113,5,47,'#acc5be');a.rect(3,150,28,8,'#d5a061');a.rect(185,33,12,30,'#597581');a.circle(191,32,8,'#91a6a7')
        if idx==1:
            a.rect(138,144,55,22,'#7f6550');a.poly([(141,144),(148,133),(160,138),(167,128),(183,144)],'#d4b17c')
        if idx==3:
            a.rect(86,28,10,35,'#5d7680');a.circle(91,25,17,'#b38a5b');a.circle(91,25,8,'#263d50')
        if idx==4:
            for x in [11,38,192]:a.rect(x,143,24,29,'#a38454');a.rect(x+3,147,18,5,'#dbc08a')
    a.save(f'surface/{name}.png')
a=Art(240,160);a.poly([(9,160),(35,63),(72,24),(161,17),(216,69),(237,160)],'#6e6252');a.poly([(34,160),(60,76),(91,50),(151,49),(187,85),(207,160)],'#172736');a.rect(38,154,168,6,'#be965a');a.save('surface/cave-mouth.png')
a=Art(320,80);a.rect(0,0,320,80,'#4b3a32')
for i in range(1800):a.rect(random.randrange(320),random.randrange(80),random.randrange(1,4),1,random.choice(['#60493b','#7a5b43','#352c2c']))
a.rect(0,0,320,4,'#b09a70');a.rect(0,4,320,5,'#756044');a.save('surface/ground.png')
a=Art(1280,560)
for y in range(560):
    k=y/560;a.rect(0,y,1280,1,'#%02x%02x%02x'%(int(9+14*k),int(20+18*k),int(34+17*k)))
for i in range(180):
    x,y=random.randrange(1280),random.randrange(420);a.rect(x,y,1 if i%3 else 2,1,random.choice(['#6e8e9c','#b1b6a0','#354e66']))
a.circle(1010,130,66,'#54636a');a.circle(1033,115,67,'#152638')
for layer,c in [(0,'#213443'),(1,'#2c3c45')]:
    pts=[(0,560)]+[(x,430+layer*50+random.randrange(-60,40)) for x in range(0,1360,60)]+[(1280,560)];a.poly(pts,c)
a.save('surface/sky.png')
for n in range(6):
    a=Art(160,240);a.rect(9,218,142,14,'#4b6370');a.rect(22,214,116,5,'#c09b69')
    if n>0:
        a.poly([(53,200),(53,70),(80,20),(107,70),(107,200)],'#a5b9b5');a.poly([(53,70),(80,20),(80,200),(53,200)],'#d2d8c3');a.rect(53,115,54,5,'#405969');a.rect(53,182,54,10,'#334c60');a.poly([(53,161),(28,208),(52,202)],'#bc774b');a.poly([(107,161),(132,208),(107,202)],'#bc774b')
    if n>1:a.rect(60,128,15,44,'#bc8153');a.rect(85,128,15,44,'#718e95');a.rect(63,132,5,34,'#e3b37c')
    if n>2:a.circle(80,85,16,'#243d51');a.circle(80,85,11,'#80d4cc');a.circle(77,82,5,'#e0fff1')
    if n>3:a.poly([(61,193),(99,193),(108,212),(52,212)],'#354b5d');a.rect(57,204,46,6,'#b7a486')
    if n>4:a.rect(69,111,22,7,'#ffd58c');a.rect(78,11,4,11,'#fbdb95')
    a.save(f'rocket/stage{n}.png')
for name,c in [('fuel','#efbd73'),('hull','#e58f80'),('cargo','#9bbec9'),('credits','#f0d39a'),('depth','#90cfc6'),('resonite','#6ff4c3'),('cryenite','#a8a1ff'),('core-sample','#ffde8a')]:
    a=Art(24,24)
    if name=='fuel':a.poly([(9,2),(17,11),(18,17),(13,22),(6,20),(4,14)],c);a.rect(8,13,3,6,'#fff0c9')
    elif name=='hull':a.poly([(3,4),(12,1),(21,4),(19,16),(12,23),(5,16)],c);a.poly([(7,7),(12,5),(17,7),(15,15),(12,18),(9,15)],'#243d50')
    elif name=='cargo':a.rect(3,6,18,15,c);a.rect(5,9,14,9,'#284355');a.rect(9,3,6,4,c)
    elif name=='credits':a.circle(12,12,10,c);a.circle(12,12,7,'#6d6654');a.rect(10,6,4,12,c)
    elif name=='depth':a.rect(10,2,4,15,c);a.poly([(4,13),(20,13),(12,22)],c)
    else:a.poly([(12,1),(20,7),(18,19),(11,23),(4,16),(5,7)],c);a.line(12,3,12,20,'#f4fff6')
    a.save(f'icons/{name}.png')
print('Original sprites and cycles produced.')
