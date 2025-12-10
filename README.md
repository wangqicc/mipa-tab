# Mipa Tab Manager

标签页管理器，帮助您将浏览器标签页组织成集合。

## 功能特性

- 📁 将标签页组织成集合
- 🌈 彩色编码的集合
- 🎯 搜索集合
- 🖱️ 在集合间拖放标签页
- 🔄 使用 GitHub Gist 在设备间实时同步
- 💾 手动数据导出/导入功能
- 📝 编辑标签页的标题、URL 和描述
- 📱 用户友好的界面
- 🗑️ 删除和重命名集合
- 🔀 重新排序集合内的标签页
- 📊 在侧边栏查看所有打开的标签页

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
2. 在弹窗中可以快速查看和搜索集合

#### 主应用模式 (完整功能)
1. 在弹窗中点击 "OPEN MIPA TAB" 按钮打开主应用
2. 在主应用中，点击 "ADD COLLECTION" 创建新集合
3. 将打开的标签页从侧边栏拖放到集合中
4. 点击集合中的标签页将其打开
5. 使用搜索栏查找特定集合

### 管理集合

1. **创建集合**：在主应用中点击 "ADD COLLECTION" 按钮，输入名称并选择颜色
2. **编辑集合**：点击集合名称进入编辑模式，或使用颜色选择器更改集合颜色
3. **删除集合**：点击集合删除按钮
4. **展开/折叠集合**：点击集合标题栏
5. **批量管理**：使用 "EXPAND/COLLAPSE" 按钮展开或折叠所有集合

### 管理标签页

1. **添加标签页**：将标签页从侧边栏拖放到集合中
2. **编辑标签页**：点击标签页上的编辑按钮（笔图标）
3. **删除标签页**：点击标签页上的删除按钮
4. **重新排序标签页**：在集合内拖放标签页
5. **复制标签页链接**：点击标签页上的链接图标

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
- JSON 数据采用固定格式存储，确保跨设备同步的一致性

## 贡献

欢迎提交问题和增强请求！

## 许可证

MIT

## 致谢

- 使用 SortableJS 实现拖放功能
- 使用 Font Awesome 图标
