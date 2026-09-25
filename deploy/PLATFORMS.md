# Публикация TezTap на Render и Vercel

## 1. Render: API и PostgreSQL

1. Войдите в Render через GitHub и создайте **New → Blueprint** для репозитория `Baktykozha1/Teztap`, ветка `main`.
2. Проверьте план ресурсов в экране подтверждения. Этот Blueprint использует бесплатный API и бесплатную PostgreSQL для временного хакатонного запуска.
3. Введите новые ключи Gemini и 2ГИС в защищённые поля Blueprint. Не используйте прежние ключи из переписки и не добавляйте секреты в репозиторий.
4. Нажмите **Deploy Blueprint**. После запуска скопируйте публичный URL `teztap-api` вида `https://...onrender.com`.
5. Проверьте его: `https://...onrender.com/api/health`. В ответе база должна быть PostgreSQL, не memory.

**Важно:** бесплатная Render PostgreSQL удаляется после 30 дней. Для долгого хранения данных переведите БД на платный план до истечения срока и настройте резервные копии. Бесплатный web-сервис может засыпать при простое.

## 2. Vercel: Next.js

1. В Vercel нажмите **Add New → Project** и импортируйте `Baktykozha1/Teztap`.
2. Выберите Root Directory `frontend`. Включите **Include source files outside of the Root Directory in the Build Step**: приложение импортирует общий модуль из `shared/` в корне репозитория.
3. Оставьте Framework Preset `Next.js`, Install Command `npm install`/автоопределение и Build Command `next build`/автоопределение.
4. В Environment Variables добавьте `API_URL` со значением Render URL без завершающего `/`, например `https://teztap-api.onrender.com`. Это серверная переменная: не называйте её `NEXT_PUBLIC_API_URL`.
5. Нажмите Deploy. Проверяйте сайт по назначенному адресу `*.vercel.app`.

Фронтенд передаёт запросы API через same-origin `/api` proxy, поэтому ключи Gemini, 2ГИС и адрес базы должны находиться только в Render. После изменения `API_URL` создайте новый Production Deployment в Vercel.

## 3. После первого запуска

- Откройте `/api/health` сайта и проверьте доступность API и PostgreSQL.
- Проверьте вход/регистрацию, карту 2ГИС и поиск в образовании/местах.
- Дождитесь первого холодного запроса к Render: бесплатный сервис может стартовать с задержкой после простоя.
- Секреты меняйте в кабинетах Render/Vercel, не в GitHub и не в чате.
