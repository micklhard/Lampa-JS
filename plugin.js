(function () {
    'use strict';

    // === ФУНКЦИИ ДЛЯ ПОЛУЧЕНИЯ НАСТРОЕК ===
    // Используем Lampa.Storage для чтения сохраненных значений или возврата значений по умолчанию
    const getRouterIp = () => Lampa.Storage.get('keenetic_ip', '192.168.2.1');
    const getRouterPort = () => Lampa.Storage.get('keenetic_port', '8090');
    const getRpcPath = () => Lampa.Storage.get('keenetic_rpc_path', '/transmission/rpc');
    const getLogin = () => Lampa.Storage.get('keenetic_login', '');
    const getPassword = () => Lampa.Storage.get('keenetic_password', '');

    // Динамически формируем URL и заголовок на основе текущих настроек
    const getRpcUrl = () => `http://${getRouterIp()}:${getRouterPort()}${getRpcPath()}`;
    const getAuthHeader = () => 'Basic ' + btoa(`${getLogin()}:${getPassword()}`);

    // Переменная для хранения ID сессии Transmission
    let sessionId = '';

    /**
     * Выполняет запрос к API Transmission.
     * Автоматически обрабатывает ошибку 409 и получает новый X-Transmission-Session-Id для повторного запроса.
     * @param {Object} payload - Тело запроса в формате JSON API Transmission
     * @returns {Promise<Object>} - Ответ от сервера
     */
    async function transmissionRequest(payload) {
        if (!getLogin() || !getPassword()) {
            Lampa.Bell.push({
                title: 'Мой Keenetic',
                text: 'Пожалуйста, укажите логин и пароль в настройках'
            });
            throw new Error('Учетные данные не настроены');
        }

        const headers = {
            'Authorization': getAuthHeader(),
            'Content-Type': 'application/json'
        };

        // Если у нас уже есть сохраненный ID сессии, добавляем его в заголовки
        if (sessionId) {
            headers['X-Transmission-Session-Id'] = sessionId;
        }

        try {
            // Отправляем первый POST-запрос
            let response = await fetch(getRpcUrl(), {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            // Особенность Transmission API:
            // Если получаем 409 Conflict, значит нужно обновить Session Id из заголовков ответа
            if (response.status === 409) {
                sessionId = response.headers.get('X-Transmission-Session-Id');
                if (!sessionId) {
                    throw new Error('Не удалось получить X-Transmission-Session-Id из ответа сервера');
                }
                
                // Обновляем заголовок с новым Session Id и повторяем запрос
                headers['X-Transmission-Session-Id'] = sessionId;
                response = await fetch(getRpcUrl(), {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(payload)
                });
            }

            // Если статус не 200 OK, бросаем ошибку
            if (!response.ok) {
                throw new Error(`Ошибка HTTP: ${response.status}`);
            }

            // Парсим успешный ответ в JSON
            return await response.json();
        } catch (error) {
            console.error('Transmission API Error:', error);
            throw error;
        }
    }

    /**
     * Проверка связи с роутером путем запроса 'session-get'
     */
    async function testConnection() {
        try {
            // Метод session-get возвращает текущие настройки сессии Transmission
            const response = await transmissionRequest({
                method: 'session-get'
            });

            // Успешный ответ всегда содержит поле result со значением 'success'
            if (response && response.result === 'success') {
                Lampa.Bell.push({
                    title: 'Мой Keenetic',
                    text: 'Связь с Keenetic установлена!'
                });
            } else {
                throw new Error('Некорректный ответ сервера');
            }
        } catch (error) {
            // Ошибка уже выведена в консоль или в Bell выше
            if (error.message !== 'Учетные данные не настроены') {
                Lampa.Bell.push({
                    title: 'Мой Keenetic',
                    text: 'Ошибка подключения'
                });
            }
        }
    }

    function startPlugin() {
        window.keenetic_plugin_initialized = true;

        // 1. Создаем раздел в настройках
        if (window.Lampa && Lampa.Settings) {
            // Добавляем категорию "Keenetic" в настройки
            Lampa.Settings.add({
                title: 'Keenetic',
                type: 'category', // Важно для создания пункта
                id: 'keenetic_settings',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4ZM11 16V8L16 12L11 16Z"/></svg>'
            });

            // Наполняем категорию полями
            Lampa.Settings.bind('keenetic_settings', function (container) {
                // Вспомогательная функция для рендера input-ов
                function renderInput(name, title, description, defaultValue) {
                    var item = $('<div class="settings-param selector" data-name="' + name + '" data-type="input">' +
                        '<div class="settings-param__name">' + title + '</div>' +
                        '<div class="settings-param__value"></div>' +
                        '<div class="settings-param__descr">' + description + '</div>' +
                        '</div>');
                    
                    var currentValue = Lampa.Storage.get(name, defaultValue);
                    item.find('.settings-param__value').text(currentValue);

                    item.on('hover:enter', function () {
                        Lampa.Keyb.open({
                            value: Lampa.Storage.get(name, defaultValue),
                            title: title,
                            success: function (val) {
                                Lampa.Storage.set(name, val);
                                item.find('.settings-param__value').text(val);
                            }
                        });
                    });
                    return item;
                }

                container.append(renderInput('keenetic_ip', 'IP адрес роутера', 'Например: 192.168.2.1', '192.168.2.1'));
                container.append(renderInput('keenetic_port', 'Порт Transmission', 'По умолчанию: 8090', '8090'));
                container.append(renderInput('keenetic_rpc_path', 'Путь RPC', 'Обычно: /transmission/rpc', '/transmission/rpc'));
                container.append(renderInput('keenetic_login', 'Логин', 'Логин от админки Keenetic', ''));
                container.append(renderInput('keenetic_password', 'Пароль', 'Пароль от админки Keenetic', ''));
            });
        }

        // 2. Добавляем пункт в главное меню
        function addMenuItem() {
            if ($('.menu .menu__list').length === 0) {
                setTimeout(addMenuItem, 100);
                return;
            }
            
            // Защита от дублей
            if ($('.menu__item[data-action="keenetic_transmission"]').length > 0) return;

            let menu_item = $('<li class="menu__item selector" data-action="keenetic_transmission">' +
                '<div class="menu__ico">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" xmlns="http://www.w3.org/2000/svg"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4ZM11 16V8L16 12L11 16Z"/></svg>' +
                '</div>' +
                '<div class="menu__text">Мой Keenetic</div>' +
                '</li>');

            menu_item.on('hover:enter', function () {
                testConnection();
            });

            $('.menu .menu__list').eq(0).append(menu_item);
        }

        addMenuItem();
    }

    if (window.appready) {
        startPlugin();
    } else {
        var listener = function (e) {
            if (e.type === 'ready' && !window.keenetic_plugin_initialized) {
                window.Lampa.Listener.remove('app', listener);
                startPlugin();
            }
        };
        if (window.Lampa && window.Lampa.Listener) {
            window.Lampa.Listener.follow('app', listener);
        } else {
            // Если Lampa еще не определена, ждем её появления
            var checkInterval = setInterval(function() {
                if (window.Lampa && window.Lampa.Listener) {
                    clearInterval(checkInterval);
                    window.Lampa.Listener.follow('app', listener);
                }
            }, 100);
        }
    }

})();
