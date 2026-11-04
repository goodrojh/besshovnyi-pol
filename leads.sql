-- Таблица заявок для gksphere.ru
-- Выполнить один раз в phpMyAdmin: выбрать свою базу → вкладка SQL → вставить → Вперёд.

CREATE TABLE IF NOT EXISTS leads (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at    DATETIME     NOT NULL,
  name          VARCHAR(200) NOT NULL,
  phone         VARCHAR(64)  NOT NULL,
  phone_digits  VARCHAR(16)  NOT NULL,
  comment       TEXT,
  interest      VARCHAR(255),
  promo         VARCHAR(255),
  source        VARCHAR(255),
  page          VARCHAR(500),
  referrer      VARCHAR(500),
  utm_source    VARCHAR(255),
  utm_medium    VARCHAR(255),
  utm_campaign  VARCHAR(255),
  utm_content   VARCHAR(255),
  utm_term      VARCHAR(255),
  ip            VARCHAR(45),
  user_agent    VARCHAR(500),
  crm_status    VARCHAR(32)  NOT NULL DEFAULT 'pending',
  crm_answer    TEXT,
  PRIMARY KEY (id),
  KEY idx_created (created_at),
  KEY idx_phone (phone_digits),
  KEY idx_crm (crm_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
