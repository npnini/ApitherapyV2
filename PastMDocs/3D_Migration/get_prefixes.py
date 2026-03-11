import json

with open('corpo_coords.json', 'r') as f:
    data = json.load(f)

prefixes = set()
for key in data.keys():
    import re
    match = re.match(r'([A-Za-z]+)', key)
    if match:
        prefixes.add(match.group(1))

print(sorted(list(prefixes)))
