Keep the existing backend and all existing APIs.

Add support for a new memorial field:

memorial_type

Allowed values:

"deceased"
"living"

When a memorial is created normally for a deceased person:

memorial_type = "deceased"

When a visitor creates an entry through "اترك أثرًا":

memorial_type = "living"

Public deceased queries must return ONLY:

status = approved
AND memorial_type = deceased

Public living أثر queries must return ONLY:

status = approved
AND memorial_type = living

Never expose pending or rejected memorials publicly.

Keep the existing:

- admin authentication
- approval system
- search
- random memorial
- daily memorial
- recent memorials
- image upload
- reports
- sharing
- prayer counting
- duplicate prayer protection
- audio system
- admin functions

Keep server-side validation.

Keep secure image validation.

Keep rate limiting.

Keep proper error handling.

Do not break existing APIs.

Existing memorials already stored in the database should be treated as:

memorial_type = "deceased"

unless the administrator explicitly changes them.

The backend must ensure that living أثر pages can never accidentally appear in deceased queries.
