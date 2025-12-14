# Mipa Tab Manager

标签页管理器，帮助您将浏览器标签页组织成集合，提高浏览效率。

## 功能特性

- 📁 将标签页组织成集合
- 🌈 彩色编码的集合（8种颜色可选）
- 🔍 搜索集合
- 🖱️ 拖放功能：
  - 在集合间拖放标签页
  - 从浏览器窗口拖放打开的标签页到集合
  - 重新排序集合内的标签页
- 🔄 使用 GitHub Gist 在设备间实时同步
- 💾 手动数据导出/导入功能
- 📝 编辑标签页的标题、URL 和描述
- 📱 用户友好的界面，支持弹窗和主应用两种模式
- 🗑️ 删除和重命名集合
- 🔀 重新排序集合
- 📊 在侧边栏查看所有打开的标签页，按窗口分组
- ⏱️ 自动保存会话数据
- 📋 复制标签页链接
- 🔍 支持URL模糊匹配，避免重复添加标签页

## 技术栈

- **前端框架**: 原生 HTML/CSS/JavaScript
- **扩展架构**: Chrome Manifest V3
- **拖放库**: SortableJS
- **图标库**: Font Awesome
- **存储方式**: Chrome Storage API
- **同步机制**: GitHub Gist API

## 安装

1. 克隆或下载此仓库
2. 打开 Chrome 浏览器
3. 转到 `chrome://extensions/`
4. 启用右上角的 "开发者模式"
5. 点击 "加载已解压的扩展程序" 并选择下载的仓库文件夹
6. 扩展程序将被添加到您的 Chrome 浏览器

## 使用方法

### 基本使用

#### 弹窗模式 (快速访问)
1. 点击 Chrome 工具栏中的 Mipa Tab Manager 图标打开弹窗
2. 在弹窗中可以快速查看和搜索所有集合
3. 点击 "+" 按钮将当前活动标签页添加到指定集合
4. 点击 "SAVE ALL TABS" 按钮将当前窗口的所有标签页保存到新集合
5. 点击 "OPEN MIPA TAB" 按钮打开主应用

#### 主应用模式 (完整功能)
1. 在弹窗中点击 "OPEN MIPA TAB" 按钮打开主应用
2. 在主应用中，您可以：
   - 查看所有集合和标签页
   - 创建、编辑、删除和重命名集合
   - 更改集合颜色
   - 拖放标签页在集合间移动
   - 从侧边栏拖放打开的标签页到集合
   - 编辑标签页的标题、URL 和描述
   - 删除标签页
   - 复制标签页链接
   - 打开所有标签页
   - 关闭当前窗口所有标签页并打开集合中的标签页

### 管理集合

1. **创建集合**：在主应用中点击 "ADD COLLECTION" 按钮，输入名称并选择颜色
2. **编辑集合**：点击集合名称进入编辑模式，或使用颜色选择器更改集合颜色
3. **删除集合**：点击集合删除按钮，会弹出确认对话框
4. **展开/折叠集合**：点击集合标题栏
5. **批量管理**：使用 "EXPAND/COLLAPSE" 按钮展开或折叠所有集合

### 管理标签页

1. **添加标签页**：
   - 弹窗模式：点击集合旁边的 "+" 按钮
   - 主应用模式：从侧边栏拖放打开的标签页到集合
2. **编辑标签页**：点击标签页上的编辑按钮（笔图标）
3. **删除标签页**：点击标签页上的删除按钮
4. **重新排序标签页**：在集合内拖放标签页
5. **复制标签页链接**：点击标签页上的链接图标
6. **打开标签页**：点击标签页卡片
7. **打开所有标签页**：点击集合标题栏上的向上箭头图标
8. **关闭当前窗口并打开集合**：点击集合标题栏上的上下箭头图标

### 数据同步

#### 使用 GitHub Gist（推荐）

1. 点击主界面中的 "Connect to Gist" 按钮
2. 在弹出的模态框中，输入具有 `gist` 权限的 GitHub Personal Access Token
3. 点击 "Connect" 按钮
4. 系统会检查是否已有 Mipa gist：
   - 如果有，会加载并合并数据
   - 如果没有，会创建新的私有 gist
5. 数据会自动同步到 gist，按钮文本变为 "Gist Connected"（绿色背景，带勾选图标）
6. 在其他设备上，安装扩展程序并再次点击 "Connect to Gist" 按钮
7. 输入相同的 GitHub token，系统会找到并使用同一个 gist
8. 数据会自动在设备间同步

**注意**：
- 您的数据会自动同步到 gist，无需手动操作
- 可以点击 "Gist Connected" 按钮登出 gist
- 登出后按钮会恢复为 "Connect to Gist"（蓝色背景，带 GitHub 图标）

#### 手动导出/导入

1. 点击 "EXPORT" 按钮将数据下载为 JSON 文件
2. 在另一台设备上，点击 "IMPORT" 并选择 JSON 文件
3. 选择替换现有数据或合并数据

## 键盘快捷键

- 当前未配置快捷键

## 要求

- Chrome 浏览器（版本 88 或更高，支持 Manifest V3）
- 用于 Gist 同步的 GitHub 账户（可选）

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
- JSON 数据采用固定格式存储，确保跨设备同步的一致性

## 项目结构

```
mipa-tab/
├── css/
│   └── styles.css          # 样式文件
├── img/
│   └── mipa.jpg            # 扩展图标
├── js/
│   ├── lib/
│   │   └── sortable.min.js # SortableJS 库
│   ├── background.js       # 后台脚本
│   ├── mipa.js             # 主应用脚本
│   └── popup.js            # 弹窗脚本
├── .gitignore              # Git 忽略文件
├── LICENSE                 # 许可证文件
├── README.md               # 项目说明文档
├── manifest.json           # 扩展配置文件（Manifest V3）
├── mipa.html               # 主应用页面
└── popup.html              # 弹窗页面
```

## 贡献

欢迎提交问题和增强请求！

## 许可证

MIT

## 致谢

- 使用 [SortableJS](https://sortablejs.github.io/Sortable/) 实现拖放功能
- 使用 [Font Awesome](https://fontawesome.com/) 图标
- 感谢所有贡献者和用户
