import zlib
from urllib.parse import unquote


def onHTTPRequest(webServerDAT, request, response):
	response['statusCode'] = 200
	response['statusReason'] = 'OK'
	response['data'] = 'td-send'
	return response


def onWebSocketOpen(webServerDAT, client, uri):
	print('open:', client, uri)


def onWebSocketClose(webServerDAT, client):
	print('close:', client)


def parseBundle(payload):
	# "value=7;action=FOLLOW;time=STILL;uid=ab12c" -> dict
	fields = {}
	for chunk in payload.split(';'):
		key, _, val = chunk.partition('=')
		if key.strip():
			fields[key.strip()] = unquote(val)
	return fields


def setChan(hub, name, value):
	# a CHOP raises if the channel was never created, so stay quiet about it
	if hub is not None and name in hub.chan:
		hub.chan[name].value = value


def onWebSocketReceiveText(webServerDAT, client, data):
	parts = data.strip().split('\t')
	if len(parts) < 2:
		return
	kind, payload = parts[0], parts[1]
	if kind != 'bundle':
		print('recv: ignored', kind, payload)
		return

	fields = parseBundle(payload)
	print('recv: bundle', fields)

	hub = op('in')
	setChan(hub, 'value', min(1000.0, max(-1000.0, float(fields.get('value', 0)))))
	if 'uid' in fields:
		# stable per-audience-member number for colouring visuals
		setChan(hub, 'uid', float(zlib.crc32(fields['uid'].encode('utf-8')) % 1000000))

	msg = op('lastmsg')
	if msg is not None:
		bits = [fields.get('value', '?')]
		for key in ('action', 'time'):
			if fields.get(key):
				bits.append(fields[key])
		msg.text = ' '.join(bits)