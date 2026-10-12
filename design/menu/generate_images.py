import json, base64, subprocess, concurrent.futures, urllib.request, sys
TOKEN = subprocess.check_output(['gcloud','auth','print-access-token']).decode().strip()
URL = 'https://aiplatform.googleapis.com/v1/projects/kibo-2026/locations/global/publishers/google/models/gemini-3.1-flash-image:generateContent'
BASE = ' Studio food photograph for a self-order kiosk menu tile, three-quarter view, centered with generous margin, isolated on a plain warm cream background (#FBF7EF), soft natural light, appetizing, consistent catalog style. No text, no letters, no logos, no brand marks, no plate.'
ITEMS = {
 'burger_cheese': 'A classic cheeseburger with melted cheddar, lettuce, tomato, sesame bun.',
 'burger_bulgogi': 'A Korean bulgogi burger: glazed sweet soy bulgogi beef patty, shredded lettuce, creamy mayo, soft plain bun.',
 'burger_shrimp': 'A crispy shrimp burger: golden panko shrimp patty with visible whole shrimp pieces, lettuce, tartar sauce, soft bun.',
 'burger_double': 'A double cheeseburger with two beef patties and two slices of melted cheddar, pickles, onions, sesame bun.',
 'burger_chicken': 'A spicy crispy chicken burger with a thick fried chicken thigh fillet, red spicy sauce, lettuce, brioche bun.',
 'set_cheese': 'A burger meal set: cheeseburger, french fries in a plain unprinted kraft paper carton, and a soda in a plain unprinted paper cup with lid and straw, arranged together.',
 'fries': 'Golden french fries in a plain unprinted kraft paper carton.',
 'cheese_sticks': 'Four golden fried mozzarella cheese sticks, one pulled to show stretchy cheese.',
 'coleslaw': 'Creamy coleslaw in a small clear plastic cup.',
 'cola': 'A cola soft drink with ice in a plain unprinted clear plastic cup with a dome lid and straw.',
 'zero_cola': 'A cola soft drink with ice in a plain matte black unprinted paper cup with a black lid and straw.',
 'cider': 'A clear lemon-lime soda with ice and bubbles in a plain unprinted clear plastic cup with lid and straw.',
 'iced_coffee': 'An iced americano coffee with ice in a plain unprinted clear plastic cup with straw.',
 'soft_cone': 'A vanilla soft serve ice cream cone with a tall swirl.',
 'apple_pie': 'A golden fried apple pie turnover, rectangular, with a bite showing cinnamon apple filling.',
}
WIDE = {
 'hero': ('A dramatic hero shot of a towering new bulgogi double burger with glistening sauce, warm cream and mustard yellow backdrop, cinematic lighting, generous empty space on the top half for headline text. No text, no letters, no logos. Vertical 9:16 composition.', '9:16'),
 'dine_in': ('A tray with a burger meal set on a light wooden restaurant table, cozy, warm cream tones. No text, no letters, no logos.', '1:1'),
 'take_out': ('A plain unprinted brown kraft paper takeout bag with a drink cup beside it on a cream background. No text, no letters, no logos.', '1:1'),
}
def gen(name, prompt, aspect='1:1'):
    body = {'contents':[{'role':'user','parts':[{'text':prompt}]}],'generationConfig':{'responseModalities':['IMAGE'],'imageConfig':{'aspectRatio':aspect}}}
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'})
    for attempt in range(3):
        try:
            d = json.load(urllib.request.urlopen(req, timeout=180))
            for p in d['candidates'][0]['content']['parts']:
                if 'inlineData' in p:
                    open(name+'.png','wb').write(base64.b64decode(p['inlineData']['data'])); return name+' ok'
        except Exception as e:
            err = str(e)
    return name+' FAIL '+err[:200]
jobs = [(k, v+BASE, '1:1') for k,v in ITEMS.items()] + [(k, v[0], v[1]) for k,v in WIDE.items()]
with concurrent.futures.ThreadPoolExecutor(6) as ex:
    for r in ex.map(lambda j: gen(*j), jobs): print(r, flush=True)
