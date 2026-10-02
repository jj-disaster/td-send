def onHTTPRequest(webServerDAT, request, response):
	response['statusCode'] = 200
	response['statusReason'] = 'OK'
	response['data'] = 'td-send'
	return response


def onWebSocketOpen(webServerDAT, client, uri):
	print('open:', client, uri)


def onWebSocketClose(webServerDAT, client):
	print('close:', client)


def onWebSocketReceiveText(webServerDAT, client, data):
	parts = data.strip().split('\t')
	if len(parts) < 2:
		return
	kind, value = parts[0], parts[1]
	uid = parts[2] if len(parts) > 2 else ''
	print('recv:', kind, value, uid)

	hub = op('in')
	if hub is None:
		return
	if kind == 'num':
		hub.chan['num'].value = min(1000.0, max(-1000.0, float(value)))
		hub.chan['uid'].value = float(uid) if uid.isdigit() else 0.0
	else:
		hub.chan['txt'].val = value
		op('lastmsg').text = value