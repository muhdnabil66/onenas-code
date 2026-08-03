document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const value = button.dataset.copy
    if (!value) return

    try {
      await navigator.clipboard.writeText(value)
      const original = button.textContent
      button.textContent = "Copied"
      button.classList.add("copied")
      window.setTimeout(() => {
        button.textContent = original
        button.classList.remove("copied")
      }, 1600)
    } catch {
      button.textContent = "Copy failed"
      window.setTimeout(() => {
        button.textContent = "Copy"
      }, 1600)
    }
  })
})
