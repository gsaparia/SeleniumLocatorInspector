import json
import sys
from lxml import html
root = html.fromstring(sys.stdin.read())
nodes = list(root.iter())
if sys.argv[1] == 'query':
    found = root.getroottree().xpath(sys.argv[2])
    print(json.dumps([nodes.index(n) for n in found]))
else:
    def tree(node):
        return dict(tag=node.tag, attrs=dict(node.attrib), direct=' '.join([node.text or ''] + [child.tail or '' for child in node]),
                    text=''.join(node.itertext()), children=[tree(child) for child in node])
    print(json.dumps(tree(root)))
