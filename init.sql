CREATE DATABASE IF NOT EXISTS `ops_box` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `ops_box`;

CREATE TABLE IF NOT EXISTS `user` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户主键',
  `email` VARCHAR(120) NOT NULL COMMENT '登录邮箱，唯一',
  `password` VARCHAR(255) NOT NULL COMMENT 'bcrypt 加密后的密码',
  `phone` VARCHAR(32) DEFAULT NULL COMMENT '联系电话，可为空',
  `nickname` VARCHAR(64) DEFAULT NULL COMMENT '用户昵称',
  `role` ENUM('super', 'manager', 'admin', 'distributor', 'user') NOT NULL DEFAULT 'user' COMMENT '角色：super 超级管理员，manager 店长，admin 管理员，distributor 分销商，user 普通用户',
  `disabled` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否禁用：1 禁用，0 启用',
  `create_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

CREATE TABLE IF NOT EXISTS `email_code` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '验证码主键',
  `email` VARCHAR(120) NOT NULL COMMENT '接收验证码的邮箱',
  `code` CHAR(6) NOT NULL COMMENT '6 位数字验证码',
  `expire_time` DATETIME NOT NULL COMMENT '验证码过期时间',
  `create_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_email_code_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邮箱验证码表';

CREATE TABLE IF NOT EXISTS `announcement` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '公告主键',
  `title` VARCHAR(255) NOT NULL COMMENT '公告标题',
  `content` LONGTEXT NOT NULL COMMENT '公告正文',
  `level` ENUM('info', 'warning', 'danger') NOT NULL DEFAULT 'info' COMMENT '公告等级',
  `is_enable` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用：1 启用，0 停用',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_announcement_enabled_id` (`is_enable`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统公告表';

CREATE TABLE IF NOT EXISTS `app_version` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '版本记录主键',
  `version` VARCHAR(32) NOT NULL COMMENT '应用版本号，例如 1.0.2',
  `download_url` VARCHAR(500) NOT NULL COMMENT '更新包公网下载地址',
  `update_log` TEXT NOT NULL COMMENT '完整更新日志',
  `is_enable` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用：1 启用，0 停用',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_app_version_enabled_id` (`is_enable`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='软件版本更新表';
