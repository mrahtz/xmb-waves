# ceilings.py: reads wavetop.js --sweep output and prints spec 4.5 (version 36)'s two ceiling checks.
# usage: python3 ceilings.py OUT.json [OUT2.json ...]
# The first check: the wave alone, by mood - its brightest output level must fall well short of the top of the range.
# The second: the finished frame in every mood and every month - the clipped pixels sorted by what they needed, and the
# strict part of the test, which is whether anything still clips with the wave and the sparkles taken away (a background
# too bright for its mood, or a bright-pass being fed too much, section 5) and whether the background on its own ever
# reaches the top level, which in the original it never does.
import sys, json
import numpy as np

MOODS = ('night', 'dawn', 'day', 'dusk')
MONTH = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split()

for p in sys.argv[1:]:
    R = json.load(open(p))
    print('== %s  (%d conditions)' % (p, len(R)))
    print('the wave alone, by mood: brightest output level of 255')
    for m in MOODS:
        v = [r['wave']['max'] for r in R if r.get('mood') == m]
        if v: print('  %-6s max %3d over the months (median %3d)' % (m, max(v), int(np.median(v))))
    print('the background alone: brightest output level (the original never reaches the top)')
    for m in MOODS:
        rs = [r for r in R if r.get('mood') == m]
        if not rs: continue
        v = [r['bg']['max'] for r in rs]
        top = [r for r in rs if r['bg']['max'] >= 255]
        print('  %-6s max %3d (%s)%s' % (m, max(v), MONTH[rs[int(np.argmax(v))]['month'] - 1],
              '' if not top else '   AT THE TOP in ' + ','.join('%s%d' % (MONTH[r['month'] - 1], r['day']) for r in top)))
    print('the finished frame: conditions whose clipped pixels do not need the wave or the sparkles')
    bad = [r for r in R if r['clipped_without_wave_or_sparkles']['pixels'] > 0]
    if not bad:
        print('  none of the %d conditions' % len(R))
    else:
        for r in bad:
            c = r['clipped_without_wave_or_sparkles']
            print('  %s%-2d %-6s %6d px in %3d patches, largest %5d at (%.2f, %.2f); needs glare %d, none of the three %d'
                  % (MONTH[r['month'] - 1], r['day'], r['mood'], c['pixels'], c['patches'], c['largest'],
                     c['at_x'] or 0, c['at_y'] or 0, r['needs']['glare'], r['needs']['none_of_the_three']))
    print('the finished frame: where it clips at all')
    any_clip = [r for r in R if r['clipped']['pixels'] > 0]
    if not any_clip:
        print('  no condition reaches the top output level')
    for r in sorted(any_clip, key=lambda r: -r['clipped']['pixels'])[:14]:
        n = r['needs']
        print('  %s%-2d %-6s %6d px, %3d patches, largest %5d at (%.2f, %.2f); of them sparkles %d, wave %d, glare %d'
              % (MONTH[r['month'] - 1], r['day'], r['mood'], r['clipped']['pixels'], r['clipped']['patches'],
                 r['clipped']['largest'], r['clipped']['at_x'] or 0, r['clipped']['at_y'] or 0,
                 n['sparkles'], n['wave'], n['glare']))
    print('the finished frame: the brightest level reached, by mood')
    for m in MOODS:
        rs = [r for r in R if r.get('mood') == m]
        if not rs: continue
        print('  %-6s all layers max %3d, background+wave %3d, share of the frame at the top %.6f'
              % (m, max(r['all']['max'] for r in rs), max(r['bgwave']['max'] for r in rs),
                 max(r['all']['s255'] for r in rs)))
    print()
