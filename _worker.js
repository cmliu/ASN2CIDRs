let GH_NAME = 'ipverse';

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const path = url.pathname;

		if (path === '/') {
			if (request.method === 'GET') {
				return new Response(renderForm('', ''), { headers: { 'content-type': 'text/html; charset=utf-8' } });
			} else if (request.method === 'POST') {
				const formData = await request.formData();
				const cidrs = formData.get('cidrs') || '';
				const expanded = cidrs
					.split('\n')
					.map(line => line.trim())
					.filter(Boolean)
					.map(expandCIDR)	// 展开每段CIDR
					.flat()
					.join('\n');
				return new Response(renderForm(cidrs, expanded), { headers: { 'content-type': 'text/html; charset=utf-8' } });
			}
			return new Response('Method not allowed', { status: 405 });
		}

		const match = path.split('.json')[0].match(/(\d{1,6})/);
		let ASN = '45102';
		if (match) ASN = match[1];
		else return new Response('"无效的 ASN:1"', { status: 400 });

		GH_NAME = env.GH_NAME || GH_NAME;
		const ASN_URL = `https://raw.githubusercontent.com/${GH_NAME}/asn-ip/refs/heads/master/as/${ASN}/aggregated.json`;
		const response = await fetch(ASN_URL);
		if (!response.ok) return new Response('"无效的 ASN:2"', { status: 400 });

		const data = await response.json();
		console.log(data);

		// 向下兼容：优先使用旧格式 subnets，不存在则使用新格式 prefixes
		const prefixData = data.subnets || data.prefixes;
		if (!prefixData) return new Response('"无效的响应格式"', { status: 400 });

		if (path.endsWith('.json')) {
			return new Response(JSON.stringify(data, null, 4), {
				status: 200,
				headers: {
					'content-type': 'application/json',
				},
			});
		} else {
			const ipv4Subnets = prefixData.ipv4;
			const ipv4Text = ipv4Subnets.join('\n');
			let text = ipv4Text;
			if ((url.searchParams.has('6') && url.searchParams.has('4')) || url.searchParams.has('all')) {
				const ipv6Subnets = prefixData.ipv6;
				const ipv6Text = ipv6Subnets.join('\n');
				if (ipv6Text) text += '\n' + ipv6Text;
			} else if (url.searchParams.has('6')) {
				const ipv6Subnets = prefixData.ipv6;
				const ipv6Text = ipv6Subnets.join('\n');
				text = ipv6Text;
			}
			return new Response(text, { status: 200 });
		}
	}
}

function renderForm(input, output) {
	return `
<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>CIDR IP地址段转换工具</title>
	<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
	<style>
			.container { max-width: 800px; margin-top: 2rem; }
			.form-text { margin-bottom: 1rem; }
			.example { background: #f8f9fa; padding: 10px; border-radius: 5px; margin: 10px 0; }
	</style>
</head>
<body>
	<div class="container">
			<h1 class="mb-4 text-center">CIDR IP地址段转换工具</h1>
			<div class="card">
					<div class="card-body">
							<form method="POST">
									<div class="mb-3">
											<label class="form-label"><strong>请输入CIDR格式的IP地址段：</strong></label>
											<div class="example">
													<small class="text-muted">
															示例格式：192.168.1.0/24<br>
															（表示192.168.1.0到192.168.1.255的地址段）
													</small>
											</div>
											<textarea class="form-control" name="cidrs" rows="5" placeholder="每行输入一个CIDR格式的IP地址段">${input}</textarea>
									</div>
									
									<div class="d-grid gap-2">
											<button class="btn btn-primary" type="submit">转换为IP地址列表</button>
									</div>

									<div class="mb-3 mt-4">
											<label class="form-label"><strong>转换结果（展开后的IP地址列表）：</strong></label>
											<textarea class="form-control" rows="10" readonly>${output}</textarea>
									</div>
							</form>
					</div>
			</div>
			
			<div class="mt-3 text-center">
					<small class="text-muted">本工具可以将CIDR格式的IP地址段转换为具体的IP地址列表</small>
			</div>
	</div>
</body>
</html>`;
}

// 简易IPv4转换函数
function ipToLong(ip) {
	return ip.split('.').reduce((r, v) => (r << 8) + parseInt(v), 0) >>> 0;
}
function longToIp(l) {
	return [24, 16, 8, 0].map(s => (l >>> s) & 255).join('.');
}

function expandCIDR(cidr) {
	const [ip, maskStr] = cidr.split('/');
	const mask = parseInt(maskStr);
	const start = ipToLong(ip);
	const hostBits = 32 - mask;
	const network = start >>> hostBits << hostBits;
	const broadcast = network + (1 << hostBits) - 1;
	const list = [];
	for (let i = network; i <= broadcast; i++) {
		list.push(longToIp(i));
	}
	return list;
}