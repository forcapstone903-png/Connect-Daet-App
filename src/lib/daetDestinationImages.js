import bagasbasImage from '@/app/(subsystems)/info/assets/images/bagasbasbeach.webp'
import daetImage from '@/app/(subsystems)/info/assets/images/daet.jpg'
import elevatedTownPlazaImage from '@/app/(subsystems)/info/assets/images/elevated-town-plaza.jpg'
import rizalMonumentImage from '@/app/(subsystems)/info/assets/images/morga.jpg'

export function getDaetDestinationImage(name = '') {
  const normalizedName = String(name).toLowerCase()

  if (normalizedName.includes('bagasbas')) return bagasbasImage.src
  if (normalizedName.includes('plaza')) return elevatedTownPlazaImage.src
  if (normalizedName.includes('rizal')) return rizalMonumentImage.src
  return daetImage.src
}
