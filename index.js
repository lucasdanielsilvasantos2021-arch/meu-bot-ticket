const { Client } = require('discord.js-selfbot-v13');
const readline = require('readline');
const https = require('https');
const WebSocket = require('ws');
const net = require('net');

const agent = new https.Agent({ 
    keepAlive: true, 
    maxSockets: Infinity,
    maxFreeSockets: 256,
    scheduling: 'lifo',
    timeout: 3000,
    keepAliveMsecs: 1000
});

const tcpSocket = net.createConnection(443, 'discord.com');
tcpSocket.setNoDelay(true);
tcpSocket.setKeepAlive(true, 1000);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.clear();
console.log('\x1b[31m🔥 BOT TICKET - SISTEMA DE COMANDOS 🔥\x1b[0m\n');

let TOKEN = '';
let GUILD_ID = '';
let CATEGORIA_ID = '';
let ws = null;
const canaisEnviados = new Set();

let BOT_LIGADO = false;
let BOT_PAUSADO = false;

const MSG_TURBO = 'Oi, como posso ajudar?';
const PAYLOAD_TURBO = Buffer.from(JSON.stringify({ content: MSG_TURBO }), 'utf8');

let MSG_MANHA = 'Bom dia! Como posso ajudar?';
let MSG_TARDE = 'Boa tarde! Como posso ajudar?';
let MSG_NOITE = 'Boa noite! Como posso ajudar?';

const FRASES = {
    manha: [
        MSG_MANHA,
        'Bom dia! Tudo bem? Como posso ajudar?',
        'Bom dia! Em que posso ajudar?',
        'Bom dia! Um momento que já te atendo.',
        'Bom dia! Só um instante e já respondo.'
    ],
    tarde: [
        MSG_TARDE,
        'Boa tarde! Tudo bem? Como posso ajudar?',
        'Boa tarde! Precisa de ajuda? Como posso ajudar?',
        'Boa tarde! Um momento que já te atendo.',
        'Boa tarde! Só um instante e já respondo.'
    ],
    noite: [
        MSG_NOITE,
        'Boa noite! Tudo bem? Como posso ajudar?',
        'Boa noite! Precisa de ajuda? Como posso ajudar?',
        'Boa noite! Um momento que já te atendo.',
        'Boa noite! Só um instante e já respondo.'
    ]
};

const PAYLOADS = {
    manha: FRASES.manha.map(f => Buffer.from(JSON.stringify({ content: f }), 'utf8')),
    tarde: FRASES.tarde.map(f => Buffer.from(JSON.stringify({ content: f }), 'utf8')),
    noite: FRASES.noite.map(f => Buffer.from(JSON.stringify({ content: f }), 'utf8'))
};

let ultimoPeriodo = '';
let ultimoIndice = -1;

function getPeriodo() {
    const h = (new Date().getUTCHours() - 3 + 24) % 24;
    return h < 12 ? (h < 5 ? 'noite' : 'manha') : (h < 18 ? 'tarde' : 'noite');
}

function getPayloadHumanizado() {
    const p = getPeriodo();
    const arr = PAYLOADS[p];
    
    if (p !== ultimoPeriodo) {
        ultimoPeriodo = p;
        ultimoIndice = Math.floor(Math.random() * arr.length);
        return arr[ultimoIndice];
    }
    
    let i;
    do {
        i = Math.floor(Math.random() * arr.length);
    } while (i === ultimoIndice && arr.length > 1);
    
    ultimoIndice = i;
    return arr[i];
}

const pathCache = new Map();
const headersTurbo = {
    'Authorization': null,
    'Content-Type': 'application/json',
    'Content-Length': PAYLOAD_TURBO.length,
    'Connection': 'keep-alive',
    'Accept': '*/*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'X-RateLimit-Precision': 'millisecond'
};

function getOptions(channelId) {
    let path = pathCache.get(channelId);
    if (!path) {
        path = `/api/v9/channels/${channelId}/messages`;
        pathCache.set(channelId, path);
    }
    
    return {
        hostname: 'discord.com',
        port: 443,
        path: path,
        method: 'POST',
        agent: agent,
        headers: headersTurbo
    };
}

function enviarTurboHTTP(channelId) {
    return new Promise((resolve) => {
        headersTurbo.Authorization = TOKEN;
        const options = getOptions(channelId);
        const req = https.request(options);
        req.write(PAYLOAD_TURBO);
        req.end();
        resolve(true);
    });
}

function enviarTurboWebSocket(channelId) {
    return new Promise((resolve) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            resolve(false);
            return;
        }
        
        const payload = {
            op: 14,
            d: {
                content: MSG_TURBO,
                channel_id: channelId,
                nonce: Date.now().toString(),
                tts: false,
                flags: 0
            }
        };
        
        try {
            ws.send(JSON.stringify(payload));
            resolve(true);
        } catch (e) {
            resolve(false);
        }
    });
}

async function enviarTurbo(channelId, tentativa = 1) {
    if (canaisEnviados.has(channelId)) return;
    
    const inicio = process.hrtime.bigint();
    
    let enviado = false;
    if (ws && ws.readyState === WebSocket.OPEN) {
        enviado = await enviarTurboWebSocket(channelId);
    } 
    
    if (!enviado) {
        enviado = await enviarTurboHTTP(channelId);
    }
    
    if (enviado) {
        canaisEnviados.add(channelId);
        
        const fim = process.hrtime.bigint();
        const tempoNs = Number(fim - inicio);
        const tempoMs = (tempoNs / 1000000).toFixed(3);
        
        console.log(`\x1b[32m[${new Date().toLocaleTimeString()}] #${channelId} enviado em ${tempoMs}ms (${tentativa}x)\x1b[0m`);
    }
    
    setTimeout(() => {
        canaisEnviados.delete(channelId);
    }, 5000);
}

async function enviarHumanizado(channelId, tentativa = 1) {
    if (canaisEnviados.has(channelId)) return;
    
    const inicio = process.hrtime.bigint();
    const payload = getPayloadHumanizado();
    
    const options = {
        hostname: 'discord.com',
        port: 443,
        path: `/api/v9/channels/${channelId}/messages`,
        method: 'POST',
        agent: agent,
        headers: {
            'Authorization': TOKEN,
            'Content-Type': 'application/json',
            'Content-Length': payload.length,
            'Connection': 'keep-alive',
            'Accept': '*/*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    };
    
    const req = https.request(options);
    req.write(payload);
    req.end();
    
    canaisEnviados.add(channelId);
    
    const fim = process.hrtime.bigint();
    const tempoNs = Number(fim - inicio);
    const tempoMs = (tempoNs / 1000000).toFixed(3);
    
    console.log(`\x1b[33m[${new Date().toLocaleTimeString()}] #${channelId} enviado em ${tempoMs}ms (${tentativa}x)\x1b[0m`);
    
    setTimeout(() => {
        canaisEnviados.delete(channelId);
    }, 5000);
}

function mostrarComandos() {
    console.log('\n\x1b[36m📋 COMANDOS DISPONÍVEIS:\x1b[0m');
    console.log('\x1b[33m═══════════════════════════════════════\x1b[0m');
    console.log('\x1b[32m⚡ LIGAR/DESLIGAR:\x1b[0m');
    console.log('  !ligar     - Liga o bot');
    console.log('  !desligar  - Desliga o bot');
    console.log('\x1b[32m⏸️  PAUSAR/RETOMAR:\x1b[0m');
    console.log('  !pausar    - Pausa temporariamente');
    console.log('  !retomar   - Retoma atividade');
    console.log('\x1b[32m📝 MENSAGENS:\x1b[0m');
    console.log('  !msg manha [texto] - Muda msg da manhã');
    console.log('  !msg tarde [texto] - Muda msg da tarde');
    console.log('  !msg noite [texto] - Muda msg da noite');
    console.log('\x1b[32m📊 STATUS:\x1b[0m');
    console.log('  !status    - Mostra status completo');
    console.log('  !clear     - Limpa cache');
    console.log('\x1b[33m═══════════════════════════════════════\x1b[0m\n');
}

function mostrarStatus() {
    console.log('\n\x1b[36m📊 STATUS DO BOT:\x1b[0m');
    console.log(`🤖 Bot: ${BOT_LIGADO ? '\x1b[32mLIGADO✅' : '\x1b[31mDESLIGADO❌'}\x1b[0m`);
    console.log(`⏸️  Pausado: ${BOT_PAUSADO ? '\x1b[33mSIM⏸️' : '\x1b[32mNÃO▶️'}\x1b[0m`);
    console.log(`📝 Mensagem Manhã: "${MSG_MANHA}"`);
    console.log(`📝 Mensagem Tarde: "${MSG_TARDE}"`);
    console.log(`📝 Mensagem Noite: "${MSG_NOITE}"`);
    console.log(`📌 Guild ID: ${GUILD_ID}`);
    if (CATEGORIA_ID) console.log(`📂 Categoria: ${CATEGORIA_ID}`);
    console.log('');
}

rl.question('Token: ', (token) => {
    TOKEN = token.trim();
    rl.question('ID do Servidor: ', (guildId) => {
        GUILD_ID = guildId.trim();
        rl.question('ID da Categoria (opcional): ', (categoriaId) => {
            CATEGORIA_ID = categoriaId.trim();
            rl.close();

            const client = new Client();

            client.on('ready', () => {
                console.log(`✅ Logado como ${client.user.username}`);
                
                if (client.ws && client.ws.connection) {
                    ws = client.ws.connection._ws;
                }
                
                mostrarComandos();
                console.log('\x1b[33m⚠️  BOT INICIADO DESLIGADO! Use !ligar para ativar\x1b[0m\n');
            });

            client.on('messageCreate', (msg) => {
                if (msg.author.id !== client.user.id) return;
                
                const args = msg.content.split(' ');
                const comando = args[0].toLowerCase();
                
                if (comando === '!ligar') {
                    BOT_LIGADO = true;
                    BOT_PAUSADO = false;
                    console.log('\x1b[32m✅ Bot LIGADO com sucesso!\x1b[0m');
                }
                else if (comando === '!desligar') {
                    BOT_LIGADO = false;
                    console.log('\x1b[31m❌ Bot DESLIGADO com sucesso!\x1b[0m');
                }
                else if (comando === '!pausar') {
                    if (!BOT_LIGADO) {
                        console.log('\x1b[33m⚠️ Bot está desligado! Use !ligar primeiro\x1b[0m');
                    } else {
                        BOT_PAUSADO = true;
                        console.log('\x1b[33m⏸️ Bot PAUSADO temporariamente\x1b[0m');
                    }
                }
                else if (comando === '!retomar') {
                    if (!BOT_LIGADO) {
                        console.log('\x1b[33m⚠️ Bot está desligado! Use !ligar primeiro\x1b[0m');
                    } else {
                        BOT_PAUSADO = false;
                        console.log('\x1b[32m▶️ Bot RETOMADO com sucesso\x1b[0m');
                    }
                }
                else if (comando === '!msg') {
                    const periodo = args[1]?.toLowerCase();
                    const texto = args.slice(2).join(' ');
                    
                    if (!texto) {
                        console.log('\x1b[33m⚠️ Use: !msg [manha/tarde/noite] [texto]\x1b[0m');
                        return;
                    }
                    
                    if (periodo === 'manha') {
                        MSG_MANHA = texto;
                        FRASES.manha[0] = texto;
                        PAYLOADS.manha[0] = Buffer.from(JSON.stringify({ content: texto }), 'utf8');
                        console.log('\x1b[32m✅ Mensagem da manhã atualizada!\x1b[0m');
                    }
                    else if (periodo === 'tarde') {
                        MSG_TARDE = texto;
                        FRASES.tarde[0] = texto;
                        PAYLOADS.tarde[0] = Buffer.from(JSON.stringify({ content: texto }), 'utf8');
                        console.log('\x1b[32m✅ Mensagem da tarde atualizada!\x1b[0m');
                    }
                    else if (periodo === 'noite') {
                        MSG_NOITE = texto;
                        FRASES.noite[0] = texto;
                        PAYLOADS.noite[0] = Buffer.from(JSON.stringify({ content: texto }), 'utf8');
                        console.log('\x1b[32m✅ Mensagem da noite atualizada!\x1b[0m');
                    }
                    else {
                        console.log('\x1b[33m⚠️ Período inválido! Use: manha, tarde ou noite\x1b[0m');
                    }
                }
                else if (comando === '!status') {
                    mostrarStatus();
                }
                else if (comando === '!clear') {
                    canaisEnviados.clear();
                    console.log('\x1b[32m🧹 Cache limpo com sucesso!\x1b[0m');
                }
            });

            client.on('raw', (packet) => {
                if (packet.t !== 'CHANNEL_CREATE') return;
                if (!BOT_LIGADO || BOT_PAUSADO) return;
                if (packet.d.guild_id !== GUILD_ID) return;
                if (CATEGORIA_ID && packet.d.parent_id !== CATEGORIA_ID) return;
                if (canaisEnviados.has(packet.d.id)) return;
                
                console.log(`\x1b[36m[${new Date().toLocaleTimeString()}] #NOVO_TICKET: #${packet.d.name}\x1b[0m`);

                setTimeout(() => {
                    enviarHumanizado(packet.d.id);
                }, 1100);
            });

            process.on('uncaughtException', () => {});
            process.on('unhandledRejection', () => {});

            client.login(TOKEN).catch((err) => {
                console.log('Erro no login, token inválido?');
                process.exit(1);
            });
        });
    });
});
