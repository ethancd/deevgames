module GuestsHelper
  def guest_name
    "guest_#{syll}#{syll}"
  end

  def guest_email(name)
    Faker::Internet.free_email(name)
  end

  def guest_avatar
    File.new("#{Rails.root}/app/assets/images/avatars/guest.png")
  end

  private
    def syll #silly name generator
      vowels = %w[a e i o]
      consonants = %w[b d j l m n p r s t v w y z]
      o = consonants.sample
      n = vowels.sample
      c = consonants.sample

      case rand
      when 0..0.05
        n + c
      when 0.05..0.075
        n + n + c
      when 0.075..0.1
        n + c + c
      when 0.1..0.9
        o + n + c
      when 0.9..0.95
        o + n + n + c
      when 0.95..1
        o + n + c + c
      end

    end

end
