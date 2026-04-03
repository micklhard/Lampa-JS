(function () {
    'use strict';

    // === НАСТРОЙКИ ПОДКЛЮЧЕНИЯ ===
    const ROUTER_IP = '192.168.2.1';
    const ROUTER_PORT = '8090';
    const RPC_PATH = '/transmission/rpc';
    const LOGIN = 'admin'; // Впишите ваш логин от роутера Keenetic
    const PASSWORD = 'password'; // Впишите ваш пароль от роутера Keenetic

    // Полный URL для запросов к Transmission RPC
    const RPC_URL = `http://${ROUTER_IP}:${ROUTER_PORT}${RPC_PATH}`;
    
    // Генерируем заголовок Basic Auth (кодируем логин и пароль в Base64)
    const getAuthHeader = () => 'Basic ' + btoa(`${LOGIN}:${PASSWORD}`);

    // Переменная для хранения ID сессии Transmission
    let sessionId = '';

    /**
     * Выполняет запрос к API Transmission.
     * Автоматически обрабатывает ошибку 409 и получает новый X-Transmission-Session-Id для повторного запроса.
     * @param {Object} payload - Тело запроса в формате JSON API Transmission
     * @returns {Promise<Object>} - Ответ от сервера
     */
    async function transmissionRequest(payload) {
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
            let response = await fetch(RPC_URL, {
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
                response = await fetch(RPC_URL, {
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
            Lampa.Bell.push({
                title: 'Мой Keenetic',
                text: 'Ошибка подключения'
            });
        }
    }

    /**
     * Инициализация плагина.
     * Добавляет пункт в главное меню Lampa.
     */
    function init() {
        Lampa.Menu.add({
            id: 'keenetic_transmission',
            name: 'Мой Keenetic',
            // Иконка (простой значок Play в круге, в формате SVG)
            icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4ZM11 16V8L16 12L11 16Z" fill="currentColor"/></svg>',
            action: function () {
                // При клике по пункту меню запускаем проверку соединения
                testConnection();
            }
        });
    }

    // Интеграция в жизненный цикл приложения Lampa
    // Запускаем инициализацию, когда приложение сообщает, что оно готово
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                init();
            }
        });
    }

})();
