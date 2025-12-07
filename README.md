# Mipa Tab Manager

标签页管理器，帮助您将浏览器标签页组织成集合。

## 功能特性

- 📁 将标签页组织成集合
- 🌈 彩色编码的集合
- 🎯 搜索集合
- 🖱️ 在集合间拖放标签页
- 🔄 使用 GitHub Gist 在设备间实时同步
- 💾 手动数据导出/导入功能
- 📱 用户友好的界面

## 安装

1. 克隆或下载此仓库
2. 打开 Chrome 浏览器
3. 转到 `chrome://extensions/`
4. 启用右上角的 "开发者模式"
5. 点击 "加载已解压的扩展程序" 并选择下载的仓库文件夹
6. 扩展程序将被添加到您的 Chrome 浏览器

## 使用方法

### 基本使用

1. 点击 Chrome 工具栏中的 Mipa Tab Manager 图标打开弹窗
2. 点击 "ADD COLLECTION" 创建新集合
3. 将打开的标签页拖放到集合中
4. 点击集合中的标签页将其打开
5. 使用搜索栏查找特定集合

### 数据同步

#### 使用 GitHub Gist（推荐）

1. 点击主界面中的 "Connect to Gist" 按钮
2. 出现提示时，输入具有 `gist` 权限的 GitHub Personal Access Token
3. 系统会检查是否已有 Mipa gist：
   - 如果有，会加载并合并数据
   - 如果没有，会创建新的私有 gist
4. 数据会自动同步到 gist，按钮文本变为 "Gist Connected ✓ Synced"
5. 在其他设备上，安装扩展程序并再次点击 "Connect to Gist" 按钮
6. 输入相同的 GitHub token，系统会找到并使用同一个 gist
7. 数据会自动在设备间同步

**注意**：
- 您的数据会自动同步到 gist，无需手动操作
- 可以点击 "Gist Connected ✓ Synced" 按钮登出 gist
- 登出后按钮会恢复为 "Connect to Gist Not Synced"

#### 手动导出/导入

1. 点击 "EXPORT" 按钮将数据下载为 JSON 文件
2. 在另一台设备上，点击 "IMPORT" 并选择 JSON 文件
3. 选择替换现有数据或合并数据

## 键盘快捷键

- 当前未配置快捷键

## 要求

- Chrome 浏览器（版本 88 或更高）
- 用于 Gist 同步的 GitHub 账户

## 权限

- `tabs`：访问和管理浏览器标签页
- `storage`：在本地存储集合数据
- `https://api.github.com/*`：与 GitHub Gist API 通信以进行数据同步

## GitHub Personal Access Token

要使用 Gist 同步，您需要创建一个具有 `gist` 权限的 GitHub Personal Access Token：

1. 转到 https://github.com/settings/tokens
2. 点击 "Generate new token"
3. 给您的 token 命名
4. 选择 `gist` 权限
5. 点击 "Generate token"
6. 复制 token 并在扩展程序提示时粘贴

## 数据存储

- 本地数据使用 Chrome 的 `chrome.storage.local` API 存储
- GitHub Gist 数据存储在私有 Gist 中
- 您的 GitHub token 存储在本地，绝不会与任何人共享

## 贡献

欢迎提交问题和增强请求！

## 许可证

MIT

## 致谢

- 使用 SortableJS 实现拖放功能
- 使用 Font Awesome 图标
