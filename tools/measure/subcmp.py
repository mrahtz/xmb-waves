"""usage: subcmp.py DIR [DIR ...] -> the chosen measures of a battery run over a subset of clips, footage beside the build.

For every clip in each run's clips.json the original's and the clean build's value is taken, and the median over the
clips of each is printed, so a short battery run on a handful of clips can be read at a glance. The measures are the
ones the motion lane is fitted against (spec 4.1, 4.4a and 4.6: the band's substance, its slow placement and the
pace of its picture).
"""
import json, sys, statistics as st

KEYS = ['wave.centre_median', 'wave.thickness_median', 'wave.thickest_over_thinnest', 'wave.peaks12_mean',
        'wave.peaks25_mean', 'wave.peaks40_mean', 'wave.partings_per_column', 'wave.face_level_median',
        'wave.line_width_median', 'wave.sheen_width_median', 'wave.fill_above_40pct', 'band.mean_over_background',
        'motion.adjacent_speed_diff', 'motion.kymo_vy_median', 'motion.corr_1s', 'motion.corr_5s',
        'motion.spectrum_above_1Hz', 'motion.spectrum_below_0.3Hz', 'motion.centre_speed_median',
        'motion.flow_vy_median', 'motion.flow_left_third', 'motion.flow_right_third', 'motion.swell_shift_median']

def load(d):
    C = json.load(open(d + '/clips.json'))['clips']
    o, c = {}, {}
    for cl in C:
        for k in KEYS:
            if k in cl.get('original', {}): o.setdefault(k, []).append(cl['original'][k])
            if k in (cl.get('clean') or {}): c.setdefault(k, []).append(cl['clean'][k])
    return o, c, len(C)

runs = [load(d) for d in sys.argv[1:]]
print('%-34s %9s' % ('measure', 'original') + ''.join('%9s' % d.split('/')[-1][:9] for d in sys.argv[1:]))
for k in KEYS:
    row = '%-34s %9.4g' % (k, st.median(runs[0][0][k]) if k in runs[0][0] else float('nan'))
    for o, c, n in runs:
        row += '%9.4g' % (st.median(c[k]) if k in c else float('nan'))
    print(row)
print('clips: ' + ', '.join('%d' % n for o, c, n in runs))
