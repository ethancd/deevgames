# Read about factories at https://github.com/thoughtbot/factory_girl

FactoryGirl.define do
  factory :damage_token do
    value 1
    game_id { FactoryGirl.create(:game).id }
  end
end
