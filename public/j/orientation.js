const permButtonDiv = document.querySelector('div#permissionButton') ?? null
if (permButtonDiv !== null) {
  const deviceOrientationPermissionButton = document.createElement('button')
  deviceOrientationPermissionButton.innerText = 'Can I please?'
  permButtonDiv.appendChild(deviceOrientationPermissionButton)
  if (deviceOrientationPermissionButton !== null) {
    window.addEventListener('touchend', async (e) => {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permissionIs = await DeviceOrientationEvent.requestPermission()
        console.log(`DeviceOrientationEvent persmission is ${permissionIs}`)
        if (permissionIs === 'granted') {
          window.addEventListener('deviceorientation', (event) => {
            // console.log(`${event.alpha} : ${event.beta} : ${event.gamma}`)
          })
        }
      } else {
        console.error('No device orientation available.')
      }
      console.info(e)
    })
  }
}
