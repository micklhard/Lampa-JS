(function () {
    'use strict';

    // РАДАР 1: Проверяем, что файл вообще долетел и запустился
    setTimeout(function() {
        if (window.Lampa && window.Lampa.Noty) {
            Lampa.Noty.show('⚙️ Keenetic: Скрипт загружен в память!');
        }
    }, 1000);

    // === ФУНКЦИИ ПОЛУЧЕНИЯ НАСТРОЕК ===
    const getRouterIp = () => Lampa.Storage.field('keenetic_ip') || '192.168.2.1';
    const getRouterPort = () => Lampa.Storage.field('keenetic_port') || '8090';
    const getRpcPath = () => Lampa.Storage.field('keenetic_rpc_path') || '/transmission/rpc';
    const getLogin = () => Lampa.Storage.field('keenetic_login') || '';
    const getPassword = () => Lampa.Storage.field('keenetic_password') || '';

    const getRpcUrl = () => `http://${getRouterIp()}:${getRouterPort()}${getRpcPath()}`;
    const getAuthHeader = () => 'Basic ' + btoa(`${getLogin()}:${getPassword()}`);

    let sessionId = '';

    // === ЯДРО ЗАПРОСОВ К РОУТЕРУ ===
    async function transmissionRequest(payload) {
        if (!getLogin() || !getPassword()) {
            Lampa.Bell.push({ title: 'Keenetic', text: 'Укажите логин и пароль в настройках!' });
            throw new Error('No credentials');
        }

        const headers = {
            'Authorization': getAuthHeader(),
            'Content-Type': 'application/json'
        };

        if (sessionId) headers['X-Transmission-Session-Id'] = sessionId;

        try {
            let response = await fetch(getRpcUrl(), {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (response.status === 409) {
                sessionId = response.headers.get('X-Transmission-Session-Id');
                headers['X-Transmission-Session-Id'] = sessionId;
                response = await fetch(getRpcUrl(), {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(payload)
                });
            }

            if (!response.ok) throw new Error(`HTTP: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Keenetic API Error:', error);
            throw error;
        }
    }

    // === ОТПРАВКА ТОРРЕНТА ===
    async function addTorrentToKeenetic(magnetUrl, title) {
        try {
            Lampa.Bell.push({ title: 'Keenetic', text: 'Отправляем задачу на роутер...' });
            
            const response = await transmissionRequest({
                method: 'torrent-add',
                arguments: { filename: magnetUrl, paused: false }
            });

            if (response && response.result === 'success') {
                Lampa.Bell.push({ title: 'Keenetic', text: `✅ Добавлено:\n${title}` });
            } else {
                throw new Error('Ошибка добавления');
            }
        } catch (error) {
            Lampa.Bell.push({ title: 'Keenetic', text: '❌ Ошибка при отправке торрента' });
        }
    }

    // === ПРОВЕРКА СВЯЗИ ===
    async function testConnection() {
        try {
            const response = await transmissionRequest({ method: 'session-get' });
            if (response && response.result === 'success') {
                Lampa.Bell.push({ title: 'Keenetic', text: '🟢 Связь с роутером работает идеально!' });
            } else {
                throw new Error('Некорректный ответ');
            }
        } catch (error) {
            if (error.message !== 'No credentials') {
                Lampa.Bell.push({ title: 'Keenetic', text: '🔴 Ошибка подключения. Проверьте IP и пароль.' });
            }
        }
    }

    // === СОЗДАНИЕ ИНТЕРФЕЙСА ===
    function init() {
        try {
            // 1. Создаем настройки
            const iconSvg = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4ZM11 16V8L16 12L11 16Z" fill="currentColor"/></svg>';
            
            if (window.Lampa && Lampa.SettingsApi) {
                Lampa.SettingsApi.addComponent({ component: 'keenetic_settings', name: 'Keenetic', icon: iconSvg });
                Lampa.SettingsApi.addParam({ component: 'keenetic_settings', param: { name: 'keenetic_ip', type: 'input', default: '192.168.2.1' }, field: { name: 'IP адрес роутера' } });
                Lampa.SettingsApi.addParam({ component: 'keenetic_settings', param: { name: 'keenetic_port', type: 'input', default: '8090' }, field: { name: 'Порт Transmission' } });
                Lampa.SettingsApi.addParam({ component: 'keenetic_settings', param: { name: 'keenetic_rpc_path', type: 'input', default: '/transmission/rpc' }, field: { name: 'Путь RPC' } });
                Lampa.SettingsApi.addParam({ component: 'keenetic_settings', param: { name: 'keenetic_login', type: 'input', default: '' }, field: { name: 'Логин' } });
                Lampa.SettingsApi.addParam({ component: 'keenetic_settings', param: { name: 'keenetic_password', type: 'input', default: '' }, field: { name: 'Пароль' } });
            }

            // 2. Добавляем кнопку в меню самым надежным методом
            if (window.Lampa && Lampa.Menu && typeof Lampa.Menu.addButton === 'function') {
                Lampa.Menu.addButton({
                    id: 'my_keenetic',
                    name: 'Мой Keenetic',
                    icon: iconSvg,
                    action: function () {
                        testConnection();
                    }
                });
            }

            // 3. Перехватчик торрентов
            Lampa.Listener.follow('torrent', function (e) {
                if (e.type === 'onlong') {
                    let magnet = e.element.MagnetUri || e.element.Link;
                    let title = e.element.title || 'Выбранный торрент';
                    if (magnet) {
                        e.menu.push({
                            title: '📥 Скачать на Keenetic',
                            onSelect: function () { addTorrentToKeenetic(magnet, title); }
                        });
                    }
                }
            });

            // РАДАР 2: Подтверждаем, что всё отрисовалось
            setTimeout(function() {
                if (window.Lampa && Lampa.Noty) Lampa.Noty.show('✅ Keenetic: Интерфейс успешно загружен!');
            }, 500);

        } catch (e) {
            if (window.Lampa && Lampa.Noty) Lampa.Noty.show('❌ Ошибка плагина: ' + e.message);
        }
    }

    // === ПРАВИЛЬНЫЙ СТАРТ ИЗ ИСХОДНИКОВ LME ===
    function startPlugin() {
        window.plugin_mykeenetic_ready = true;
        if (window.appready) {
            init();
        } else {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') init();
            });
        }
    }

    if (!window.plugin_mykeenetic_ready) {
        startPlugin();
    }

})();
