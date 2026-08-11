const app = document.getElementById("app");

const visitorKey = (() => {
  try {
    let key =
      localStorage.getItem(
        "athar_visitor"
      );

    if (!key) {
      key = crypto.randomUUID();

      localStorage.setItem(
        "athar_visitor",
        key
      );
    }

    return key;
  } catch {
    return crypto.randomUUID();
  }
})();

/* =========================
   HELPERS
========================= */

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[char]
  );

const placeholder = () =>
  `<div class="placeholder">أثر</div>`;

function toast(message) {
  const old =
    document.querySelector(".toast");

  if (old) {
    old.remove();
  }

  const element =
    document.createElement("div");

  element.className = "toast";
  element.textContent = message;

  document.body.appendChild(element);

  setTimeout(() => {
    element.remove();
  }, 2800);
}

async function api(
  url,
  options = {}
) {
  const response =
    await fetch(url, options);

  let data = {};

  try {
    data =
      await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      "حدث خطأ أثناء تنفيذ العملية"
    );
  }

  return data;
}

/* =========================
   INTRO
========================= */

function introDone() {
  const intro =
    document.getElementById("intro");

  if (!intro) {
    return;
  }

  const hide = () => {
    intro.classList.add("hide");

    setTimeout(() => {
      intro.remove();
    }, 1100);
  };

  const skip =
    document.getElementById(
      "skipIntro"
    );

  if (skip) {
    skip.onclick = hide;
  }

  setTimeout(hide, 3200);
}

/* =========================
   CARD
========================= */

function card(memorial) {
  return `
    <a
      class="card"
      href="/memorial/${encodeURIComponent(
        memorial.id
      )}"
    >
      ${
        memorial.image_url
          ? `
            <img
              loading="lazy"
              src="${esc(
                memorial.image_url
              )}"
              alt="${esc(
                memorial.display_name
              )}"
            >
          `
          : placeholder()
      }

      <h3>
        ${esc(
          memorial.display_name
        )}
      </h3>

      <div class="muted">
        رحمه الله
        ${
          memorial.death_date
            ? " · " +
              esc(
                memorial.death_date
              )
            : ""
        }
      </div>
    </a>
  `;
}

/* =========================
   HOME
========================= */

async function home() {
  introDone();

  try {
    const data =
      await api("/api/home");

    app.innerHTML = `
      <section class="hero">
        <div>
          <h1>
            بعض الأسماء لا ينبغي أن تُنسى.
          </h1>

          <p>
            صفحات تحفظ ذكرى من رحلوا،
            وتمرّ عليها دعوة طيبة
            لعلها تكون نورًا لهم.
          </p>

          <div class="actions">
            <a
              class="btn primary"
              href="#search"
            >
              🔎 البحث عن متوفى
            </a>

            <a
              class="btn"
              href="#create"
            >
              ✦ إنشاء تذكرة للمتوفى
            </a>
          </div>
        </div>
      </section>

      ${
        data.daily
          ? `
            <section class="section">
              <h2>دعوة اليوم</h2>

              <p class="muted">
                اليوم نتذكر اسمًا رحل،
                ونترك له دعوة.
              </p>

              <div class="grid">
                ${card(data.daily)}
              </div>
            </section>
          `
          : ""
      }

      <section
        class="section"
        id="random"
      >
        <div
          class="box randomBox"
        >
          <h2>
            تقليب عشوائي
          </h2>

          <p class="muted">
            قد لا تعرفه، وربما لم تسمع
            باسمه من قبل...
            <br>
            لعلّ الله ساقك إلى ذكراه
            لتدعو له.
            <br>
            فربما كانت دعوتك هي الخير
            الذي لم نكن نعلمه.
          </p>

          <button
            class="btn primary"
            id="randomBtn"
          >
            🎲 قلّب لي ذكرى
          </button>
        </div>
      </section>

      ${
        data.latest?.length
          ? `
            <section class="section">
              <h2>
                تذكارات أضيفت حديثًا
              </h2>

              <div class="grid">
                ${data.latest
                  .map(card)
                  .join("")}
              </div>
            </section>
          `
          : ""
      }

      <section
        class="section"
        id="search"
      >
        <h2>
          ابحث عن متوفى
        </h2>

        <p class="muted">
          ربما تجد اسمًا تعرفه،
          وربما تجد اسمًا فتدعو له.
        </p>

        <div class="searchbar">
          <input
            id="q"
            type="search"
            placeholder="اكتب اسم المتوفى..."
            autocomplete="off"
          >

          <button
            class="btn"
            id="searchBtn"
          >
            بحث
          </button>

          <button
            class="btn"
            id="randomSearchBtn"
          >
            شخص عشوائي
          </button>
        </div>

        <div
          id="results"
          class="grid"
        ></div>
      </section>

      <section
        class="section"
        id="create"
      >
        <h2>
          أنشئ تذكرة لمن تحب
        </h2>

        <p class="muted">
          أنشئ مساحة تحفظ ذكراه
          وتتيح للناس الدعاء له.
        </p>

        <form
          class="form"
          id="createForm"
          enctype="multipart/form-data"
        >
          <label>
            اسم المتوفى / اسم العرض

            <input
              name="display_name"
              required
              minlength="2"
              maxlength="200"
            >
          </label>

          <label>
            تاريخ الوفاة

            <input
              type="date"
              name="death_date"
            >
          </label>

          <label>
            صورة المتوفى — اختياري

            <input
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp,image/avif"
            >

            <small class="muted">
              إذا لم ترغب في إضافة صورة،
              يكفي الاسم، وإن شاء الله بالنيات.
            </small>
          </label>

          <label>
            عن صاحب الذكرى — اختياري

            <textarea
              name="short_bio"
              rows="4"
              maxlength="2000"
            ></textarea>
          </label>

          <label>
            كلمة لمن يمر من هنا — اختياري

            <textarea
              name="visitor_message"
              rows="3"
              maxlength="1000"
              placeholder="لو مررت من هنا، فلا تنسه من دعائك."
            ></textarea>
          </label>

          <button
            class="btn primary"
            type="submit"
          >
            إرسال التذكرة للمراجعة
          </button>
        </form>
      </section>
    `;

    document
      .getElementById("randomBtn")
      ?.addEventListener(
        "click",
        randomMem
      );

    document
      .getElementById("randomSearchBtn")
      ?.addEventListener(
        "click",
        randomMem
      );

    document
      .getElementById("searchBtn")
      ?.addEventListener(
        "click",
        search
      );

    document
      .getElementById("q")
      ?.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key === "Enter"
          ) {
            event.preventDefault();
            search();
          }
        }
      );

    document
      .getElementById("createForm")
      ?.addEventListener(
        "submit",
        createMemorial
      );
  } catch (error) {
    app.innerHTML = `
      <div class="empty pageError">
        ${esc(error.message)}
      </div>
    `;
  }
}

/* =========================
   SEARCH
========================= */

async function search() {
  const input =
    document.getElementById("q");

  const results =
    document.getElementById(
      "results"
    );

  if (!input || !results) {
    return;
  }

  const query =
    input.value.trim();

  if (!query) {
    results.innerHTML = `
      <div class="empty">
        اكتب اسم المتوفى أولًا.
      </div>
    `;

    return;
  }

  results.innerHTML = `
    <div class="empty">
      جارٍ البحث...
    </div>
  `;

  try {
    const data =
      await api(
        "/api/memorials?q=" +
        encodeURIComponent(query)
      );

    results.innerHTML =
      data.items?.length
        ? data.items
            .map(card)
            .join("")
        : `
          <div class="empty">
            لا توجد تذكارات منشورة
            بهذا الاسم.
          </div>
        `;
  } catch (error) {
    results.innerHTML = `
      <div class="empty">
        ${esc(error.message)}
      </div>
    `;
  }
}

/* =========================
   RANDOM
========================= */

async function randomMem() {
  try {
    const memorial =
      await api(
        "/api/random"
      );

    location.href =
      "/memorial/" +
      encodeURIComponent(
        memorial.id
      );
  } catch (error) {
    toast(error.message);
  }
}

/* =========================
   CREATE MEMORIAL
========================= */

async function createMemorial(
  event
) {
  event.preventDefault();

  const form =
    event.currentTarget;

  const button =
    form.querySelector(
      "button[type='submit']"
    );

  button.disabled = true;
  button.textContent =
    "جارٍ الإرسال...";

  try {
    await api(
      "/api/memorials",
      {
        method: "POST",
        body:
          new FormData(form)
      }
    );

    form.reset();

    toast(
      "تم استلام التذكار للمراجعة 🤍"
    );
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent =
      "إرسال التذكرة للمراجعة";
  }
}

/* =========================
   MEMORIAL PAGE
========================= */

async function memorial(id) {
  introDone();

  try {
    const memorial =
      await api(
        "/api/memorials/" +
        encodeURIComponent(id)
      );

    document.title =
      memorial.display_name +
      " — أثر";

    const audio =
      memorial.audio
        ? `
          <audio
            class="audio"
            controls
            preload="none"
            src="${esc(
              memorial.audio.audio_url
            )}"
          ></audio>

          <div class="muted">
            ${esc(
              memorial.audio.title
            )}
          </div>
        `
        : `
          <p class="muted">
            سيضاف مقطع الذكرى من لوحة الإدارة.
          </p>
        `;

    app.innerHTML = `
      <article class="memorial">

        <div class="memHero">

          ${
            memorial.image_url
              ? `
                <img
                  class="memPhoto"
                  src="${esc(
                    memorial.image_url
                  )}"
                  alt="${esc(
                    memorial.display_name
                  )}"
                >
              `
              : placeholder()
          }

          <h1>
            ${esc(
              memorial.display_name
            )}
          </h1>

          <div class="muted">
            رحمه الله
            ${
              memorial.death_date
                ? " · " +
                  esc(
                    memorial.death_date
                  )
                : ""
            }
          </div>
        </div>

        <div class="quote">
          هم السابقون... ونحن اللاحقون.
        </div>

        ${
          memorial.short_bio
            ? `
              <section class="box">
                <h2>
                  عن صاحب الذكرى
                </h2>

                <p>
                  ${esc(
                    memorial.short_bio
                  )}
                </p>
              </section>
            `
            : ""
        }

        ${
          memorial.visitor_message
            ? `
              <section class="box">
                <h2>
                  كلمة لمن يمر من هنا
                </h2>

                <p>
                  ${esc(
                    memorial.visitor_message
                  )}
                </p>
              </section>
            `
            : ""
        }

        <section class="box">
          <h2>أذكار</h2>

          <div class="dhikr">
            ${
              [
                "سبحان الله",
                "الحمد لله",
                "الله أكبر",
                "لا إله إلا الله",
                "لا حول ولا قوة إلا بالله"
              ]
                .map(
                  (text) =>
                    `<span class="pill">${text}</span>`
                )
                .join("")
            }
          </div>
        </section>

        <section class="box">
          <h2>أدعية</h2>

          <p>
            اللهم اغفر له وارحمه،
            وعافه واعف عنه،
            وأكرم نزله ووسع مدخله.
          </p>

          <p>
            اللهم ارحمه رحمة واسعة،
            واغفر له، وارفع درجته
            في المهديين.
          </p>

          <p>
            اللهم اجمعنا به
            في جنات النعيم.
          </p>
        </section>

        <section class="box">
          <h2>
            🌿 صدقة ودعاء
          </h2>

          <p>
            إن أحببت أن تهدي ثواب
            عمل صالح لمن رحل،
            فافعل خيرًا لوجه الله
            وادعُ له.
          </p>

          ${audio}
        </section>

        <section class="box">
          <h2>🌱 باب الخير</h2>

          <p>
            <b>💧 سقيا الماء</b>
            <br>
            اسقِ إنسانًا أو ساهم
            في توفير الماء لمن يحتاجه.
          </p>

          <p>
            <b>📖 صدقة بالقرآن</b>
            <br>
            ساهم في توفير مصحف
            أو دعم تعليم القرآن.
          </p>

          <p>
            <b>🍞 إطعام الطعام</b>
            <br>
            أطعم محتاجًا وادعُ للميت.
          </p>

          <p>
            <b>🤍 مساعدة محتاج</b>
            <br>
            قدم ما تستطيع لمن يحتاج،
            وادعُ له.
          </p>

          <p class="muted">
            نسأل الله أن يتقبل
            وينفع بها.
          </p>
        </section>

        <section class="prayer box">

          <p>
            إن مررت من هنا،
            فلا تنسَه من دعائك.
          </p>

          <button
            id="pray"
            class="btn primary"
            type="button"
          >
            🤲 دعوت له
          </button>

          <div class="count">
            دُعي له
            <span id="count">
              ${Number(
                memorial.prayer_count || 0
              )}
            </span>
            مرة
          </div>

        </section>

        <section
          class="box shareBox"
        >
          <h2>
            شارك الذكرى
          </h2>

          <button
            id="shareBtn"
            class="btn"
            type="button"
          >
            مشاركة الذكرى
          </button>

          <p class="muted">
            مررت من هنا... وتركت دعوة.
          </p>
        </section>

        <section class="final">

          <h2>
            قبل أن تغادر...
          </h2>

          <p>
            اللهم اغفر له وارحمه،
            ونوّر قبره،
            وآنس وحشته،
            وارفع درجته،
            واجعل له من رحمتك
            نصيبًا واسعًا.
          </p>

          <p>
            رحمهم الله جميعًا.
          </p>

          <button
            id="reportBtn"
            class="btn"
            type="button"
          >
            الإبلاغ عن مشكلة
          </button>

        </section>

      </article>
    `;

    const prayButton =
      document.getElementById(
        "pray"
      );

    const count =
      document.getElementById(
        "count"
      );

    prayButton?.addEventListener(
      "click",
      async () => {
        prayButton.disabled = true;

        try {
          const result =
            await api(
              "/api/prayers/" +
              encodeURIComponent(
                memorial.id
              ),
              {
                method: "POST",
                headers: {
                  "X-Visitor-Key":
                    visitorKey
                }
              }
            );

          count.textContent =
            result.prayer_count;

          if (result.added) {
            toast(
              "تقبّل الله دعاءك 🤍"
            );
          } else {
            toast(
              "تم تسجيل دعائك سابقًا 🤍"
            );
          }
        } catch (error) {
          prayButton.disabled =
            false;

          toast(
            error.message
          );
        }
      }
    );

    document
      .getElementById(
        "shareBtn"
      )
      ?.addEventListener(
        "click",
        () =>
          shareMem(memorial)
      );

    document
      .getElementById(
        "reportBtn"
      )
      ?.addEventListener(
        "click",
        () =>
          reportMem(
            memorial.id
          )
      );
  } catch (error) {
    app.innerHTML = `
      <div
        class="empty pageError"
      >
        ${esc(error.message)}
      </div>
    `;
  }
}

/* =========================
   SHARE
========================= */

async function shareMem(
  memorial
) {
  const data = {
    title:
      "أثر — رحمهم الله",

    text:
      `هذه تذكرة ذكرى لـ ${memorial.display_name}.
إن مررت بها، فلا تنسه من دعائك.
رحمه الله.`,

    url:
      location.href
  };

  try {
    if (
      navigator.share
    ) {
      await navigator.share(
        data
      );

      return;
    }

    await navigator.clipboard.writeText(
      location.href
    );

    toast(
      "تم نسخ رابط الذكرى 🤍"
    );
  } catch {
    /* المستخدم أغلق نافذة المشاركة */
  }
}

/* =========================
   REPORT
========================= */

async function reportMem(id) {
  const reason =
    prompt(
      "اكتب سبب البلاغ:"
    );

  if (!reason?.trim()) {
    return;
  }

  try {
    await api(
      "/api/reports",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          memorial_id: id,
          reason:
            reason.trim()
        })
      }
    );

    toast(
      "تم استلام البلاغ 🤍"
    );
  } catch (error) {
    toast(error.message);
  }
}

/* =========================
   MENU
========================= */

function setupMenu() {
  const menu =
    document.getElementById(
      "menu"
    );

  const nav =
    document.querySelector(
      "nav"
    );

  if (!menu || !nav) {
    return;
  }

  menu.addEventListener(
    "click",
    () => {
      nav.classList.toggle(
        "mobile"
      );
    }
  );

  nav
    .querySelectorAll("a")
    .forEach((link) => {
      link.addEventListener(
        "click",
        () => {
          nav.classList.remove(
            "mobile"
          );
        }
      );
    });
}

/* =========================
   ROUTER
========================= */

setupMenu();

const parts =
  location.pathname
    .split("/")
    .filter(Boolean);

if (
  parts[0] === "memorial" &&
  parts[1]
) {
  memorial(
    decodeURIComponent(
      parts[1]
    )
  );
} else {
  home();
}
