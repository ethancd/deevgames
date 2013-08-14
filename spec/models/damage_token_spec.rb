require 'spec_helper'

describe DamageToken do
  it "has a valid factory" do
    FactoryGirl.create(:damage_token).should be_valid
  end
end
