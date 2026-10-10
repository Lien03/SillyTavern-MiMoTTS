const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadProvider(fetch) {
    const field = {
        val() { return this; },
        prop() { return this; },
        off() { return this; },
        on() { return this; },
    };
    const source = fs.readFileSync(`${__dirname}/index.js`, 'utf8')
        .replace(/^import .*;\r?$/gm, '')
        .replace(/^export /gm, '');
    return vm.runInNewContext(`${source}\nMiMoTtsProvider;`, {
        document: { createElement: () => ({}), getElementById: () => null },
        $: () => field,
        console: { info() {}, warn() {} },
        eventSource: null,
        event_types: {},
        registerTtsProvider() {},
        saveTtsProviderSettings() {},
        setTimeout() {},
        URL,
        fetch,
    });
}

test('reload preserves the saved API key', async () => {
    const Provider = loadProvider();
    const provider = new Provider();
    await provider.loadSettings({ api_key: 'test-key', base_url: 'https://relay.example/v1' });
    assert.equal(provider.settings.api_key, 'test-key');
    assert.equal(provider.settings.base_url, 'https://relay.example/v1');
});

test('official and relay requests include both authentication headers', async () => {
    const requests = [];
    const Provider = loadProvider((url, options) => requests.push({ url, options }));
    const provider = new Provider();
    for (const base_url of ['', 'https://relay.example/v1/']) {
        await provider.loadSettings({ api_key: ' test-key ', base_url });
        for (const stream of [false, true]) {
            provider.postDirect('你好。', '茉莉', stream, stream ? 'pcm16' : 'mp3');
        }
    }
    assert.equal(requests[0].url, 'https://api.xiaomimimo.com/v1/chat/completions');
    assert.equal(requests[2].url, 'https://relay.example/v1/chat/completions');
    for (const { options } of requests) {
        assert.equal(options.headers['api-key'], 'test-key');
        assert.equal(options.headers.Authorization, 'Bearer test-key');
        assert.equal(JSON.parse(options.body).messages[1].content, '你好。');
    }
});

test('a missing API key fails before a request is sent', async () => {
    const Provider = loadProvider(() => assert.fail('unexpected request'));
    const provider = new Provider();
    await provider.loadSettings({});
    assert.throws(() => provider.postDirect('你好。', '茉莉', false, 'mp3'), /API Key/);
});
