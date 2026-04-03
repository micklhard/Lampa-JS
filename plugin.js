(function () {
    'use strict';

    // === ВИЗУАЛЬНАЯ ДИАГНОСТИКА СТАРТА ===
    // Если скрипт скачался и запустился, через 2 секунды на ТВ появится это уведомление
    setTimeout(function() {
        if (window.Lampa && Lampa.Noty) {
            Lampa.Noty.show('⏳ Keenetic: Запуск плагина...');
        }
    }, 2000);

    // === 1. ПОЛУЧЕНИЕ НАСТРОЕК ИЗ LAMPA ===
    const getRouterIp = () => Lampa.Storage.get('keenetic_ip', '192.168.2.1');
    const getRouterPort = () => Lampa.Storage.get('keenetic_port', '8090');
    const getRpcPath = () => Lampa.Storage.get('keenetic_rpc_path', '/transmission/rpc');
    const getLogin = () => Lampa.Storage.get('keenetic_login', '');
    const getPassword = () => Lampa.Storage.get('keenetic_password', '');

    const getRpcUrl = () => `http://${getRouterIp()}:${getRouterPort()}${getRpcPath()}`;
    const getAuthHeader = () => 'Basic ' + btoa(`${getLogin()}:${getPassword()}`);

    let sessionId = '';

    // === 2. ЯДРО ЗАПРОСОВ К TRANSMISSION ===
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

    // === 3. ОТПРАВКА ТОРРЕНТА НА РОУТЕР ===
    async function addTorrentToKeenetic(magnetUrl, title) {
        try {
            Lampa.Bell.push({ title: 'Keenetic', text: 'Отправляем задачу на роутер...' });
            
            const response = await transmissionRequest({
                method: 'torrent-add',
                arguments: {
                    filename: magnetUrl,
                    paused: false
                }
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

    // === 4. ТЕСТОВОЕ СОЕДИНЕНИЕ ===
    async function testConnection() {
        try {
            const response = await transmissionRequest({ method: 'session-get' });
            if (response && response.result === 'success') {
                Lampa.Bell.push({ title: 'Keenetic', text: '🟢 Связь работает идеально!' });
            } else {
                throw new Error('Некорректный ответ');
            }
        } catch (error) {
            if (error.message !== 'No credentials') {
                Lampa.Bell.push({ title: 'Keenetic', text: '🔴 Ошибка подключения. Проверьте IP и пароль.' });
            }
        }
    }

    // === 5. ИНТЕРФЕЙС НАСТРОЕК ===
    function initSettings() {
        if (!window.Lampa || !window.Lampa.SettingsApi) return;
        const iconSvg = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4ZM11 16V8L16 12L11 16Z" fill="currentColor"/></svg>';
        
        Lampa.SettingsApi.addComponent({ component: 'keenetic_settings', name: 'Keenetic', icon: iconSvg });
        Lampa.SettingsApi.addParam({ component: 'keenetic_settings', param: { name: 'keenetic_ip', type: 'input', default: '192.168.2.1' }, field: { name: 'IP адрес роутера' } });
        Lampa.SettingsApi.addParam({ component: 'keenetic_settings', param: { name: 'keenetic_port', type: 'input', default: '8090' }, field: { name: 'Порт Transmission' } });
        Lampa.SettingsApi.addParam({ component: 'keenetic_settings', param: { name: 'keenetic_rpc_path', type: 'input', default: '/transmission/rpc' }, field: { name: 'Путь RPC' } });
        Lampa.SettingsApi.addParam({ component: 'keenetic_settings', param: { name: 'keenetic_login', type: 'input', default: '' }, field: { name: 'Логин' } });
        Lampa.SettingsApi.addParam({ component: 'keenetic_settings', param: { name: 'keenetic_password', type: 'input', default: '' }, field: { name: 'Пароль' } });
    }

    // === 6. ИНТЕГРАЦИЯ В LAMPA ===
    function init() {
        try {
            initSettings();

            // Железобетонное добавление пункта меню через jQuery
            const iconSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4ZM11 16V8L16 12L11 16Z" fill="currentColor"/></svg>';
            let menuItem = $(`<li class="menu__item selector"><div class="menu__ico">${iconSvg}</div><div class="menu__text">Мой Keenetic</div></li>`);
            
            menuItem.on('hover:enter', function () { testConnection(); });

            // Функция для вставки меню с проверкой
            function injectMenu() {
                if ($('.menu .menu__list').length) {
                    $('.menu .menu__list').eq(0).append(menuItem);
                } else {
                    // Если меню еще не появилось, ждем полсекунды и пробуем снова
                    setTimeout(injectMenu, 500);
                }
            }
            injectMenu();

            // Перехватчик торрентов
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

            // Сообщаем об успехе
            setTimeout(function() {
                if (window.Lampa && Lampa.Noty) Lampa.Noty.show('✅ Плагин Keenetic установлен!');
            }, 3000);

        } catch (e) {
            // Если что-то сломалось, выводим ошибку на экран ТВ
            if (window.Lampa && Lampa.Noty) Lampa.Noty.show('❌ Ошибка плагина: ' + e.message);
        }
    }

    // === 7. ЗАПУСК ===
    function startPlugin() {
        if (window.keenetic_plugin_initialized) return;
        window.keenetic_plugin_initialized = true;
        init();
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') startPlugin();
        });
    }

})();
