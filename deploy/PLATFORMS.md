# Публикация TezTap на Render и Vercel

## 1. Render: API и PostgreSQL

1. Войдите в Render через GitHub и создайте **New → Blueprint** для репозитория `Baktykozha1/Teztap`, ветка `main`.
2. Проверьте план ресурсов в экране подтверждения. Этот Blueprint использует бесплатный API и бесплатную PostgreSQL для временного хакатонного запуска.
3. Введите ключи Gemini, 2ГИС Places и отдельный `TWOGIS_MAPGL_KEY` с доступом к Map Tiles API в защищённые поля Blueprint. Не добавляйте секреты в репозиторий.
4. Нажмите **Deploy Blueprint**. После запуска скопируйте публичный URL `teztap-api` вида `https://...onrender.com`.
5. Проверьте его: `https://...onrender.com/api/health`. В ответе база должна быть PostgreSQL, не memory.

**Важно:** бесплатная Render PostgreSQL удаляется после 30 дней. Для долгого хранения данных переведите БД на платный план до истечения срока и настройте резервные копии. Бесплатный web-сервис может засыпать при простое.

## 2. Vercel: Next.js

1. В Vercel нажмите **Add New → Project** и импортируйте `Baktykozha1/Teztap`.
2. Выберите Root Directory `frontend`. Включите **Include source files outside of the Root Directory in the Build Step**: приложение импортирует общий модуль из `shared/` в корне репозитория.
3. Оставьте Framework Preset `Next.js`, Install Command `npm install`/автоопределение и Build Command `next build`/автоопределение.
4. В Environment Variables добавьте `API_URL` со значением Render URL без завершающего `/`, например `https://teztap-api.onrender.com`. Это серверная переменная: не называйте её `NEXT_PUBLIC_API_URL`.
5. Нажмите Deploy. Проверяйте сайт по назначенному адресу `*.vercel.app`.

Фронтенд передаёт запросы API через same-origin `/api` proxy, поэтому ключи Gemini, 2ГИС и адрес базы хранятся в Render. `TWOGIS_MAPGL_KEY` — отдельный ключ Map Tiles API для страницы пробок; сервер отдаёт его только конфигурационному запросу MapGL, который затем использует SDK в браузере. В Platform Manager ограничьте его HTTP-заголовком `Origin: teztap-eta.vercel.app` (и `Referer` сайта, если включаете это ограничение). Не используйте для этого существующий Places-ключ. После изменения `API_URL` создайте новый Production Deployment в Vercel.

## 3. После первого запуска

- Откройте `/api/health` сайта и проверьте доступность API и PostgreSQL.
- Проверьте вход/регистрацию, карту пробок `/traffic`, карту 2ГИС и поиск в образовании/местах.
- Дождитесь первого холодного запроса к Render: бесплатный сервис может стартовать с задержкой после простоя.
- Секреты меняйте в кабинетах Render/Vercel, не в GitHub и не в чате.
