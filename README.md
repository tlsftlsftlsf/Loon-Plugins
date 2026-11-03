# Loon-Plugins

收集与维护个人常用的 Loon 插件、脚本与去广告分流规则配置。

---

## 插件列表

### 1. 喜鸟提取收件人手机号 (`Xiniao_Receiver_Phone.plugin`)

拦截喜鸟运单收件人手机号接口（`receiverPhone`），自动弹出系统通知，点击通知直接将提取到的手机号复制到剪贴板，不跳转任何多余页面。

#### 订阅链接
* **Loon 插件链接 (GitHub Raw)**：
  ```text
  https://raw.githubusercontent.com/tlsftlsftlsf/Loon-Plugins/main/Plugin/Xiniao_Receiver_Phone.plugin
  ```
* **国内加速链接 (jsDelivr)**：
  ```text
  https://fastly.jsdelivr.net/gh/tlsftlsftlsf/Loon-Plugins@main/Plugin/Xiniao_Receiver_Phone.plugin
  ```

---

### 2. 中通未派件地址关键词过滤 (`ZTO_Address_Filter.plugin`)

拦截掌中通派件列表接口（`NOT_DISPATCH_DETAIL_BUILD_LIST`），根据内置的地址关键词列表自动筛选过滤派件数据，只保留匹配的订单并弹出过滤统计通知。

#### 订阅链接
* **Loon 插件链接 (GitHub Raw)**：
  ```text
  https://raw.githubusercontent.com/tlsftlsftlsf/Loon-Plugins/main/Plugin/ZTO_Address_Filter.plugin
  ```
* **国内加速链接 (jsDelivr)**：
  ```text
  https://fastly.jsdelivr.net/gh/tlsftlsftlsf/Loon-Plugins@main/Plugin/ZTO_Address_Filter.plugin
  ```

---

### 3. 韵达超市 / 韵镖侠去广告 (`Yunda_Express_AdBlock.plugin`)

过滤**韵达超市**（`yun da chao shi`）、**韵镖侠** App 的开屏广告、弹窗推广及内嵌的穿山甲、快手、腾讯优量汇、贝梓移动等第三方广告联盟 SDK。

#### 订阅链接
* **Loon 插件链接 (GitHub Raw)**：
  ```text
  https://raw.githubusercontent.com/tlsftlsftlsf/Loon-Plugins/main/Plugin/Yunda_Express_AdBlock.plugin
  ```
* **国内加速链接 (jsDelivr)**：
  ```text
  https://fastly.jsdelivr.net/gh/tlsftlsftlsf/Loon-Plugins@main/Plugin/Yunda_Express_AdBlock.plugin
  ```

---

### 4. 儿童手表及联盟去广告 (`KidsWatch_AdBlock.plugin`)

过滤**小寻**（小寻电话手表 App）、**360儿童卫士** App 的开屏广告、自建广告位，以及内嵌的穿山甲、腾讯优量汇、快手联盟、百度百意、贝梓等多家广告联盟 SDK。

#### 订阅链接
* **Loon 插件链接 (GitHub Raw)**：
  ```text
  https://raw.githubusercontent.com/tlsftlsftlsf/Loon-Plugins/main/Plugin/KidsWatch_AdBlock.plugin
  ```
* **国内加速链接 (jsDelivr)**：
  ```text
  https://fastly.jsdelivr.net/gh/tlsftlsftlsf/Loon-Plugins@main/Plugin/KidsWatch_AdBlock.plugin
  ```

---

## 规则分流 (Rule-Set) 列表

如果你希望通过 Loon、Surge 或 Shadowrocket 的规则集形式引用：

* **韵达超市去广告规则集**：
  ```text
  https://raw.githubusercontent.com/tlsftlsftlsf/Loon-Plugins/main/Rule/Yunda_Express_AdBlock.list
  ```
* **儿童手表去广告规则集**：
  ```text
  https://raw.githubusercontent.com/tlsftlsftlsf/Loon-Plugins/main/Rule/KidsWatch_AdBlock.list
  ```

---

## 安装与使用方式

1. 打开 **Loon** -> 点击底部 **「配置」** -> 选择 **「插件」**；
2. 点击右上角 **「+」** 号；
3. 将上述对应插件的订阅链接粘贴至 **「URL」** 输入框，点击保存并启用；
4. 首次使用脚本类插件请确保 Loon 的 **MITM (中间人证书)** 已安装并信任。
