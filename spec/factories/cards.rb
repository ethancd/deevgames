# Read about factories at https://github.com/thoughtbot/factory_girl

FactoryGirl.define do
  factory :card do
    dir "forward"
    value 1
    game_id { FactoryGirl.create(:game).id }
    location "deck"
  end
end
